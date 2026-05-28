# Inventory

> **Tab:** inventory | **Component:** Inventory.tsx

## Overview
Van parts and tools stock management. Sultan tracks what is in the van, gets low-stock alerts, and manages pricing.

## Layout
```
[Metric Cards: Total Assets | Low Stock Alerts | Inventory Value]
[Search Bar] [Category Filter Buttons]
[Inventory Table]
[Add Item Button]
```

## Metric Cards
| Card | Value |
|------|-------|
| Total Assets | Count of all parts |
| Low Stock Alerts | Count of parts below reorder point |
| Inventory Value | Sum of (stock * price) for all parts |

## Category Filters
Key Blanks | Remotes | Cylinders | Hardware | Tools

## Table Columns
| Column | Description |
|--------|-------------|
| SKU | Unique part code (e.g. KB-SC1-BR) |
| Item Name | Part description |
| Category | Badge |
| Stock | Current quantity (amber row = below reorder point) |
| Unit Price | Price in USD |
| Edit | Opens edit modal |

## Add/Edit Modal Fields
| Field | Type | Notes |
|-------|------|-------|
| Name | Text | Part description |
| SKU | Text | Unique code |
| Category | Dropdown | 5 categories |
| Stock | Number stepper | Inc/dec buttons |
| Reorder Point | Number | Alert threshold |
| Unit Price | Number | USD |
| Delete button | | Only shown when editing existing item |

## Interactions

### Search
- Real-time filter by SKU or item name

### Category Filter
- Click category button to filter table
- Click again to deselect

### Edit Item
- Click edit icon on row -> opens modal pre-filled with item data
- Save -> updates store
- Delete -> removes from store, closes modal

### Add New Item
- "Add" button -> opens empty modal
- Save -> adds to store with auto-generated ID

## Business Rules
- Rows with stock < reorderPoint highlighted in amber
- Line items in JobDetail auto-decrement inventory stock when part is added
- Removing a line item from a job increments stock back

## APIs
None - reads/writes Zustand store.
