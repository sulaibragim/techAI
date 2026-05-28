# Enum Dictionary

## JobStatus
| Value | Color | Meaning |
|-------|-------|---------|
| scheduled | Slate #94A3B8 | Job booked, tech not yet dispatched |
| enRoute | Blue #3B82F6 | Tech driving to client location |
| onSite | Amber #F59E0B | Tech arrived at location |
| diagnosed | Amber #F59E0B | Tech assessed the problem |
| sold | Green #10B981 | Client approved the work/quote |
| coffee | Red #EF4444 | Job stalled / no progress ("coffee break") |
| waitingParts | Purple #8B5CF6 | Waiting on parts to arrive |
| completed | Green #10B981 | Work done and paid |
| cancelled | Slate #64748B | Job cancelled |

## Lock Types (LockDetails.type)
| Value | Description |
|-------|-------------|
| Automotive | Car/truck/vehicle locks and ignitions |
| Residential | Home door locks |
| Commercial | Business/storefront hardware |
| Secure / Safe | Safes, vaults, gun safes |
| Other | Anything else |

## Part Categories (Inventory)
| Value | Examples |
|-------|---------|
| Key Blanks | Schlage SC1, Kwikset KW1 blanks |
| Remotes | Proximity keys, transponder keys, key fobs |
| Cylinders | Mortise cylinders, rim cylinders |
| Hardware | Smart locks, deadbolts, complete sets |
| Tools | Lishi picks, extractors, programming devices |

## LineItem Types
| Value | Description |
|-------|-------------|
| labor | Technician labor charge |
| part | Physical part/product |
| service_call | Dispatch/trip fee |
| maintenance | Maintenance service |
| installation | Installation labor |

## Message Senders
| Value | Description |
|-------|-------------|
| technician | Sultan (the tech) |
| client | Customer |
| assistant | Durachok AI |
| system | Automated system message |

## Payment Status
| Value | Description |
|-------|-------------|
| paid | Payment collected |
| unpaid | Balance outstanding |

## Call Types
| Value | Color | Description |
|-------|-------|-------------|
| incoming | Green | Client called in |
| outgoing | Blue | Tech called out |
| missed | Red | Unanswered call |

## Plan Status (financialUtils)
| Value | Condition | Meaning |
|-------|-----------|---------|
| excellent | variance >= 5% | Ahead of target |
| good | variance >= 0% | On track |
| warning | variance >= -10% | Slightly behind |
| critical | variance < -10% | Significantly behind |
