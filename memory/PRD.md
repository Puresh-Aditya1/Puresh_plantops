# Puresh Daily - PRD

## Original Problem Statement
Cloned from "Puresh Daily Plant Operation" — a full-stack milk product manufacturing inventory management app. Renamed to "Puresh Daily".

## Core Requirements
1. **Batch Entry & Tracking**: Produce semi-finished products. Raw materials and Milk are optional. Support "Other Costs".
2. **Finished Products Management**: Pack batches into SKUs, "Receive" finished products from external sources, "Repack" stock with 'R' series batch numbers, and book "Wastage". Edit features, date/search filters.
3. **Raw Material Tracking**: Direct Consumption to stock out raw materials without attaching to a batch.
4. **Wastage & Loss Tracking**: Dashboard section visible to admin and modify roles.
5. **Data Safety & Admin Features**: Automated daily scheduled backups + manual backup/restore. Admin can disable users.
6. **User Activity Log**: Admin-only audit trail tracking all key user actions with filters.
7. **Manual Consumption Packing**: For semi-finished to finished products without fixed conversion ratios.
8. **Bulk Rate Management**: Rate Management tab in Raw Material Master with auto-closing dates and batch cost recalculation.

## Tech Stack
- Frontend: React, Tailwind CSS, shadcn/ui, Recharts, Axios, cmdk (searchable selects)
- Backend: FastAPI (modular routes), Pydantic, PyJWT, Asyncio
- Database: MongoDB (Motor/PyMongo)
- Auth: JWT (72h expiry), bcrypt
- Transactions: Compensating Transaction Pattern

## Credentials
- Admin: `admin` / `admin123`
- Plant Supervisor: `supervisor1` / `supervisor123`

## Inherited Features (from Puresh Daily Plant Operation)
- All batch, packing, dispatch, stock, ledger, archive, and reporting features
- Bulk Rate Management with batch cost recalculation on rate changes
- sonner toast notifications
- Excel exports
- Searchable dropdowns
- Batch pagination
- Data Archive System
- Atomic Transactions

## Bug Fixes (This Session)
- **Finished Product Cost Cascade**: When batch data is edited OR raw material rates change, all linked finished products automatically recalculate `semi_finished_cost`, `total_packing_cost`, and `cost_per_finished_unit`. Full cascade: Rate Change → Batch Cost → Finished Product Cost.
- **Batch Edit Response**: PUT /api/batches now returns computed `cost_per_unit` (was returning 0 before).
- **Packing Edit Missing additional_costs**: Frontend PUT payload for packing edits was missing `additional_costs`.
- **Rate Change → Packing Material Cost Cascade**: `additional_materials_cost` in finished products now updates when RM rate changes.
- **Cost Trend for Direct Batch→Finished**: Products skipping semi-finished stage now appear in cost trend.
- **Transaction Log Timezone**: Fixed UTC times displaying incorrectly.
- **Archive Batch Remaining Stock**: Fixed to calculate from archived data instead of deleted live data.
- **Archive Packing Entries**: Fixed field names, removed double-counted receives, added "Stock At Archive" column.
- **Archive Closing Stock Summary**: New "Closing Stock" tab with per-SKU breakdown.

## Upcoming/Backlog Tasks
- **P1**: Add "Additional Costs" to Packing Form
- **P1**: Enforce batch-wise finished product stock keeping
- **P2**: Fix React Hook dependency warnings
- **P3**: Dashboard milk stock summary widget
