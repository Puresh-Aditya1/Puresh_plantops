"""
Transaction Manager for MongoDB without Replica Set

Implements compensating transactions pattern:
1. Record intended changes in a pending transaction
2. Execute each step with rollback capability
3. If any step fails, execute compensating actions for completed steps
4. Mark transaction complete or failed

This ensures atomicity even without native MongoDB transactions.
"""

from datetime import datetime, timezone
from typing import List, Dict, Any, Callable, Optional
from dataclasses import dataclass, field
import traceback
import uuid


@dataclass
class TransactionStep:
    """Represents a single step in a transaction"""
    name: str
    execute: Callable  # Async function to execute
    compensate: Callable  # Async function to rollback
    result: Any = None
    completed: bool = False
    error: str = None


@dataclass 
class Transaction:
    """Represents a multi-step transaction"""
    transaction_id: str
    transaction_type: str  # e.g., 'batch_create', 'packing', 'dispatch'
    steps: List[TransactionStep] = field(default_factory=list)
    started_at: datetime = None
    completed_at: datetime = None
    status: str = 'pending'  # pending, in_progress, completed, failed, rolled_back
    error: str = None
    metadata: Dict[str, Any] = field(default_factory=dict)


class TransactionManager:
    """
    Manages multi-step transactions with compensation/rollback capability.
    
    Usage:
        tm = TransactionManager(db, 'batch_create', {'batch_id': '123'})
        
        tm.add_step(
            name='deduct_milk',
            execute=lambda: db.milk.update_one(...),
            compensate=lambda: db.milk.update_one(...)  # reverse the deduction
        )
        
        tm.add_step(
            name='create_batch',
            execute=lambda: db.batches.insert_one(...),
            compensate=lambda: db.batches.delete_one(...)
        )
        
        success, result = await tm.execute()
    """
    
    def __init__(self, db, transaction_type: str, metadata: Dict[str, Any] = None):
        self.db = db
        self.transaction = Transaction(
            transaction_id=str(uuid.uuid4()),
            transaction_type=transaction_type,
            started_at=datetime.now(timezone.utc),
            metadata=metadata or {}
        )
        self._step_results = {}
    
    def add_step(self, name: str, execute: Callable, compensate: Callable = None):
        """Add a step to the transaction"""
        self.transaction.steps.append(TransactionStep(
            name=name,
            execute=execute,
            compensate=compensate or (lambda: None)
        ))
    
    def get_result(self, step_name: str) -> Any:
        """Get the result of a previously executed step"""
        return self._step_results.get(step_name)
    
    async def execute(self) -> tuple[bool, Any]:
        """
        Execute all steps in order.
        If any step fails, rollback all completed steps.
        
        Returns: (success: bool, result_or_error: Any)
        """
        self.transaction.status = 'in_progress'
        completed_steps = []
        final_result = None
        
        try:
            # Log transaction start
            await self._log_transaction('started')
            
            for step in self.transaction.steps:
                try:
                    # Execute the step
                    result = await step.execute()
                    step.result = result
                    step.completed = True
                    self._step_results[step.name] = result
                    completed_steps.append(step)
                    final_result = result
                    
                except Exception as e:
                    step.error = str(e)
                    self.transaction.error = f"Step '{step.name}' failed: {str(e)}"
                    self.transaction.status = 'failed'
                    
                    # Rollback completed steps in reverse order
                    await self._rollback(completed_steps)
                    
                    # Log failure
                    await self._log_transaction('failed')
                    
                    return False, self.transaction.error
            
            # All steps completed successfully
            self.transaction.status = 'completed'
            self.transaction.completed_at = datetime.now(timezone.utc)
            
            # Log success
            await self._log_transaction('completed')
            
            return True, final_result
            
        except Exception as e:
            self.transaction.error = f"Transaction error: {str(e)}"
            self.transaction.status = 'failed'
            await self._rollback(completed_steps)
            await self._log_transaction('failed')
            return False, self.transaction.error
    
    async def _rollback(self, completed_steps: List[TransactionStep]):
        """Rollback completed steps in reverse order"""
        self.transaction.status = 'rolling_back'
        
        for step in reversed(completed_steps):
            try:
                if step.compensate:
                    await step.compensate()
                    step.completed = False  # Mark as rolled back
            except Exception as e:
                # Log rollback failure - this is serious
                error_msg = f"CRITICAL: Rollback failed for step '{step.name}': {str(e)}"
                print(error_msg)
                # Continue rolling back other steps
        
        self.transaction.status = 'rolled_back'
    
    async def _log_transaction(self, event: str):
        """Log transaction state to database for audit/recovery"""
        try:
            log_entry = {
                'transaction_id': self.transaction.transaction_id,
                'transaction_type': self.transaction.transaction_type,
                'event': event,
                'status': self.transaction.status,
                'started_at': self.transaction.started_at,
                'completed_at': self.transaction.completed_at,
                'error': self.transaction.error,
                'metadata': self.transaction.metadata,
                'steps': [
                    {
                        'name': s.name,
                        'completed': s.completed,
                        'error': s.error
                    }
                    for s in self.transaction.steps
                ],
                'logged_at': datetime.now(timezone.utc)
            }
            
            await self.db.transaction_logs.insert_one(log_entry)
        except Exception as e:
            # Don't fail the transaction if logging fails
            print(f"Warning: Failed to log transaction: {e}")


# Convenience function for simple two-step transactions
async def atomic_transfer(
    db,
    transaction_type: str,
    deduct_collection: str,
    deduct_filter: dict,
    deduct_update: dict,
    add_collection: str,
    add_document: dict,
    metadata: dict = None
) -> tuple[bool, Any]:
    """
    Simple atomic transfer: deduct from one collection, add to another.
    
    Example: Deduct milk, add batch
    """
    tm = TransactionManager(db, transaction_type, metadata)
    
    # Store original value for rollback
    original_doc = await db[deduct_collection].find_one(deduct_filter)
    
    # Step 1: Deduct
    async def execute_deduct():
        result = await db[deduct_collection].update_one(deduct_filter, deduct_update)
        return result
    
    async def compensate_deduct():
        # Reverse the update - this is simplified, may need more complex logic
        if '$inc' in deduct_update:
            reverse_update = {'$inc': {k: -v for k, v in deduct_update['$inc'].items()}}
            await db[deduct_collection].update_one(deduct_filter, reverse_update)
    
    tm.add_step('deduct', execute_deduct, compensate_deduct)
    
    # Step 2: Add
    inserted_id = None
    
    async def execute_add():
        nonlocal inserted_id
        result = await db[add_collection].insert_one(add_document)
        inserted_id = result.inserted_id
        return result
    
    async def compensate_add():
        if inserted_id:
            await db[add_collection].delete_one({'_id': inserted_id})
    
    tm.add_step('add', execute_add, compensate_add)
    
    return await tm.execute()
