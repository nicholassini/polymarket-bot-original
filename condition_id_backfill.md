# condition_id Backfill

**Run timestamp:** 2026-05-01T23:24:15.706Z

## Pre-State

Open positions with NULL condition_id: **10**

List:
- (id=1, market_id=0x62b5209029f8bb64080aef432cd7d2ea25fd0155142c3b5c7b2ef940fde14fbe)
- (id=2, market_id=0xd9c3cba9982e6d16440808b0aebcf8ab3d0e67ad58d0e8acad2d1d1801f9a252)
- (id=3, market_id=0xa4d72632ac0ddadcac5247ffc586a193f1bc3bc839cf9ce993c2471e0d599cca)
- (id=4, market_id=0x6e1fbd722b0aca8a4e05c7c2f4ff1428d4c97f2ee02056712463d00c1c705a55)
- (id=5, market_id=0x5072d0bf27763754b734c63255c4cbbba79d9d09b214accf33ecc79b88b1d108)
- (id=7, market_id=0x0c23424305573f92b0d87984e0e22dc9c1c634bed50248b1c0036acfcd75ed4a)
- (id=9, market_id=0x32ab21f24cc416e95ca901db3e60c45dbf62cde28ce472f9b660ca87f8bf7c67)
- (id=10, market_id=0x87d4c453e155252d84becb7b26c2c686954ee5085dffd1e7062aca1763ef14c4)
- (id=13, market_id=2053404)
- (id=14, market_id=1611527)

## Derivation

| id | market_id | derivation_method | derived_condition_id | clob_or_gamma_verified | onchain_valid | onchain_payoutDenominator | source |
|----|-----------|-------------------|----------------------|------------------------|---------------|---------------------------|--------|
| 1 | `0x62b52090…e14fbe` | hex_equals_market_id | `0x62b52090…e14fbe` | ✓ | ✓ | 1 | CLOB GET /markets/0x62b5209029f8bb64080aef432cd7d2ea25fd0155142c3b5c7b2ef940fde14fbe → condition_id=0x62b5209029f8bb64080aef432cd7d2ea25fd0155142c3b5c7b2ef940fde14fbe |
| 2 | `0xd9c3cba9…f9a252` | hex_equals_market_id | `0xd9c3cba9…f9a252` | ✓ | ✓ | 0 | CLOB GET /markets/0xd9c3cba9982e6d16440808b0aebcf8ab3d0e67ad58d0e8acad2d1d1801f9a252 → condition_id=0xd9c3cba9982e6d16440808b0aebcf8ab3d0e67ad58d0e8acad2d1d1801f9a252 |
| 3 | `0xa4d72632…599cca` | hex_equals_market_id | `0xa4d72632…599cca` | ✓ | ✓ | 0 | CLOB GET /markets/0xa4d72632ac0ddadcac5247ffc586a193f1bc3bc839cf9ce993c2471e0d599cca → condition_id=0xa4d72632ac0ddadcac5247ffc586a193f1bc3bc839cf9ce993c2471e0d599cca |
| 4 | `0x6e1fbd72…705a55` | hex_equals_market_id | `0x6e1fbd72…705a55` | ✓ | ✓ | 0 | CLOB GET /markets/0x6e1fbd722b0aca8a4e05c7c2f4ff1428d4c97f2ee02056712463d00c1c705a55 → condition_id=0x6e1fbd722b0aca8a4e05c7c2f4ff1428d4c97f2ee02056712463d00c1c705a55 |
| 5 | `0x5072d0bf…b1d108` | hex_equals_market_id | `0x5072d0bf…b1d108` | ✓ | ✓ | 0 | CLOB GET /markets/0x5072d0bf27763754b734c63255c4cbbba79d9d09b214accf33ecc79b88b1d108 → condition_id=0x5072d0bf27763754b734c63255c4cbbba79d9d09b214accf33ecc79b88b1d108 |
| 7 | `0x0c234243…75ed4a` | hex_equals_market_id | `0x0c234243…75ed4a` | ✓ | ✓ | 1 | CLOB GET /markets/0x0c23424305573f92b0d87984e0e22dc9c1c634bed50248b1c0036acfcd75ed4a → condition_id=0x0c23424305573f92b0d87984e0e22dc9c1c634bed50248b1c0036acfcd75ed4a |
| 9 | `0x32ab21f2…bf7c67` | hex_equals_market_id | `0x32ab21f2…bf7c67` | ✓ | ✓ | 1 | CLOB GET /markets/0x32ab21f24cc416e95ca901db3e60c45dbf62cde28ce472f9b660ca87f8bf7c67 → condition_id=0x32ab21f24cc416e95ca901db3e60c45dbf62cde28ce472f9b660ca87f8bf7c67 |
| 10 | `0x87d4c453…ef14c4` | hex_equals_market_id | `0x87d4c453…ef14c4` | ✓ | ✓ | 0 | CLOB GET /markets/0x87d4c453e155252d84becb7b26c2c686954ee5085dffd1e7062aca1763ef14c4 → condition_id=0x87d4c453e155252d84becb7b26c2c686954ee5085dffd1e7062aca1763ef14c4 |
| 13 | `2053404` | gamma_api_conditionId | `0xa70b2489…951c4f` | ✓ | ✓ | 1 | Gamma GET /markets/2053404 → conditionId=0xa70b24891ed3b6d2daf4648be7fef1da5432749995d39e95bb2a46c4d7951c4f |
| 14 | `1611527` | gamma_api_conditionId | `0xcd215b83…e6c262` | ✓ | ✓ | 0 | Gamma GET /markets/1611527 → conditionId=0xcd215b8330a35098a1a3f6c46b6492347edb5e74c1e0a95ac4d3d54aece6c262 |

## Writes

### id=1

```sql
UPDATE positions SET condition_id = '0x62b5209029f8bb64080aef432cd7d2ea25fd0155142c3b5c7b2ef940fde14fbe', updated_at = '2026-05-01T23:24:15.706Z' WHERE id = 1 AND status = 'open' AND condition_id IS NULL;
```

- **rows_changed:** 1
- **Before:** condition_id = NULL
- **After:** condition_id = 0x62b5209029f8bb64080aef432cd7d2ea25fd0155142c3b5c7b2ef940fde14fbe

### id=2

```sql
UPDATE positions SET condition_id = '0xd9c3cba9982e6d16440808b0aebcf8ab3d0e67ad58d0e8acad2d1d1801f9a252', updated_at = '2026-05-01T23:24:15.706Z' WHERE id = 2 AND status = 'open' AND condition_id IS NULL;
```

- **rows_changed:** 1
- **Before:** condition_id = NULL
- **After:** condition_id = 0xd9c3cba9982e6d16440808b0aebcf8ab3d0e67ad58d0e8acad2d1d1801f9a252

### id=3

```sql
UPDATE positions SET condition_id = '0xa4d72632ac0ddadcac5247ffc586a193f1bc3bc839cf9ce993c2471e0d599cca', updated_at = '2026-05-01T23:24:15.706Z' WHERE id = 3 AND status = 'open' AND condition_id IS NULL;
```

- **rows_changed:** 1
- **Before:** condition_id = NULL
- **After:** condition_id = 0xa4d72632ac0ddadcac5247ffc586a193f1bc3bc839cf9ce993c2471e0d599cca

### id=4

```sql
UPDATE positions SET condition_id = '0x6e1fbd722b0aca8a4e05c7c2f4ff1428d4c97f2ee02056712463d00c1c705a55', updated_at = '2026-05-01T23:24:15.706Z' WHERE id = 4 AND status = 'open' AND condition_id IS NULL;
```

- **rows_changed:** 1
- **Before:** condition_id = NULL
- **After:** condition_id = 0x6e1fbd722b0aca8a4e05c7c2f4ff1428d4c97f2ee02056712463d00c1c705a55

### id=5

```sql
UPDATE positions SET condition_id = '0x5072d0bf27763754b734c63255c4cbbba79d9d09b214accf33ecc79b88b1d108', updated_at = '2026-05-01T23:24:15.706Z' WHERE id = 5 AND status = 'open' AND condition_id IS NULL;
```

- **rows_changed:** 1
- **Before:** condition_id = NULL
- **After:** condition_id = 0x5072d0bf27763754b734c63255c4cbbba79d9d09b214accf33ecc79b88b1d108

### id=7

```sql
UPDATE positions SET condition_id = '0x0c23424305573f92b0d87984e0e22dc9c1c634bed50248b1c0036acfcd75ed4a', updated_at = '2026-05-01T23:24:15.706Z' WHERE id = 7 AND status = 'open' AND condition_id IS NULL;
```

- **rows_changed:** 1
- **Before:** condition_id = NULL
- **After:** condition_id = 0x0c23424305573f92b0d87984e0e22dc9c1c634bed50248b1c0036acfcd75ed4a

### id=9

```sql
UPDATE positions SET condition_id = '0x32ab21f24cc416e95ca901db3e60c45dbf62cde28ce472f9b660ca87f8bf7c67', updated_at = '2026-05-01T23:24:15.706Z' WHERE id = 9 AND status = 'open' AND condition_id IS NULL;
```

- **rows_changed:** 1
- **Before:** condition_id = NULL
- **After:** condition_id = 0x32ab21f24cc416e95ca901db3e60c45dbf62cde28ce472f9b660ca87f8bf7c67

### id=10

```sql
UPDATE positions SET condition_id = '0x87d4c453e155252d84becb7b26c2c686954ee5085dffd1e7062aca1763ef14c4', updated_at = '2026-05-01T23:24:15.706Z' WHERE id = 10 AND status = 'open' AND condition_id IS NULL;
```

- **rows_changed:** 1
- **Before:** condition_id = NULL
- **After:** condition_id = 0x87d4c453e155252d84becb7b26c2c686954ee5085dffd1e7062aca1763ef14c4

### id=13

```sql
UPDATE positions SET condition_id = '0xa70b24891ed3b6d2daf4648be7fef1da5432749995d39e95bb2a46c4d7951c4f', updated_at = '2026-05-01T23:24:15.706Z' WHERE id = 13 AND status = 'open' AND condition_id IS NULL;
```

- **rows_changed:** 1
- **Before:** condition_id = NULL
- **After:** condition_id = 0xa70b24891ed3b6d2daf4648be7fef1da5432749995d39e95bb2a46c4d7951c4f

### id=14

```sql
UPDATE positions SET condition_id = '0xcd215b8330a35098a1a3f6c46b6492347edb5e74c1e0a95ac4d3d54aece6c262', updated_at = '2026-05-01T23:24:15.706Z' WHERE id = 14 AND status = 'open' AND condition_id IS NULL;
```

- **rows_changed:** 1
- **Before:** condition_id = NULL
- **After:** condition_id = 0xcd215b8330a35098a1a3f6c46b6492347edb5e74c1e0a95ac4d3d54aece6c262

## Post-State

Open positions with NULL condition_id: **0**

Total open positions: **10**