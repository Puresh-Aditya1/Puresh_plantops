import React from 'react';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle
} from './ui/alert-dialog';

const ConfirmDialog = ({ open, title = 'Confirm', description = 'Are you sure?', confirmText = 'Confirm', onConfirm, onCancel }) => (
  <AlertDialog open={open} onOpenChange={(v) => { if (!v) onCancel(); }}>
    <AlertDialogContent data-testid="confirm-dialog">
      <AlertDialogHeader>
        <AlertDialogTitle data-testid="confirm-dialog-title">{title}</AlertDialogTitle>
        <AlertDialogDescription data-testid="confirm-dialog-description">{description}</AlertDialogDescription>
      </AlertDialogHeader>
      <AlertDialogFooter>
        <AlertDialogCancel data-testid="confirm-dialog-cancel" onClick={onCancel}>Cancel</AlertDialogCancel>
        <AlertDialogAction data-testid="confirm-dialog-confirm" onClick={onConfirm} className="bg-red-600 hover:bg-red-700 text-white">{confirmText}</AlertDialogAction>
      </AlertDialogFooter>
    </AlertDialogContent>
  </AlertDialog>
);

export default ConfirmDialog;
