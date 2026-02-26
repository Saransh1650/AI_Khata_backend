-- ============================================================
-- Seed: Sample Data for Test User ONLY
-- User ID : fd09997d-8460-4fbb-bd31-fc98d832305a
-- Store ID : 710f0802-9349-4a6c-9ce0-215324909964
-- Run via  : psql $DATABASE_URL -f src/config/seed_test_user.sql
-- ============================================================

-- Convenience variables
DO $$
DECLARE
  v_user  UUID := 'fd09997d-8460-4fbb-bd31-fc98d832305a';
  v_store UUID := '710f0802-9349-4a6c-9ce0-215324909964';

  -- Bill IDs (30 bills across ~90 days)
  b01 UUID; b02 UUID; b03 UUID; b04 UUID; b05 UUID;
  b06 UUID; b07 UUID; b08 UUID; b09 UUID; b10 UUID;
  b11 UUID; b12 UUID; b13 UUID; b14 UUID; b15 UUID;
  b16 UUID; b17 UUID; b18 UUID; b19 UUID; b20 UUID;
  b21 UUID; b22 UUID; b23 UUID; b24 UUID; b25 UUID;
  b26 UUID; b27 UUID; b28 UUID; b29 UUID; b30 UUID;

  -- Ledger IDs matching bills
  l01 UUID; l02 UUID; l03 UUID; l04 UUID; l05 UUID;
  l06 UUID; l07 UUID; l08 UUID; l09 UUID; l10 UUID;
  l11 UUID; l12 UUID; l13 UUID; l14 UUID; l15 UUID;
  l16 UUID; l17 UUID; l18 UUID; l19 UUID; l20 UUID;
  l21 UUID; l22 UUID; l23 UUID; l24 UUID; l25 UUID;
  l26 UUID; l27 UUID; l28 UUID; l29 UUID; l30 UUID;

BEGIN

-- ============================================================
-- BILLS (30 bills — mix of ocr/manual, COMPLETED/UPLOADED)
-- ============================================================
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '88 days') RETURNING id INTO b01;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'Reliance Fresh Receipt\nRice 5kg Rs120\nAtta 10kg Rs350\nDal 1kg Rs110\nTotal Rs580', NOW() - INTERVAL '84 days') RETURNING id INTO b02;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '80 days') RETURNING id INTO b03;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'BigBasket\nMaida 5kg Rs200\nSugar 5kg Rs230\nSalt 1kg Rs20\nMustard Oil 1L Rs150\nTotal Rs600', NOW() - INTERVAL '77 days') RETURNING id INTO b04;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '73 days') RETURNING id INTO b05;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'D-Mart Receipt\nToor Dal 2kg Rs240\nChana Dal 1kg Rs115\nPoha 500g Rs45\nSuji 1kg Rs55\nTotal Rs455', NOW() - INTERVAL '70 days') RETURNING id INTO b06;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '66 days') RETURNING id INTO b07;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'Metro Cash & Carry\nBiscuits Parle 50pk Rs600\nMaggi 12pk Rs144\nTea Brooke Bond 500g Rs185\nTotal Rs929', NOW() - INTERVAL '62 days') RETURNING id INTO b08;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '59 days') RETURNING id INTO b09;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'Wholesale Supplier\nRice Sona Masoori 50kg Rs2200\nAtta Ashirwad 50kg Rs1800\nTotal Rs4000', NOW() - INTERVAL '55 days') RETURNING id INTO b10;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '51 days') RETURNING id INTO b11;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'HUL Distributor\nSurf Excel 1kg x10 Rs1500\nRin 500g x10 Rs500\nLifebuoy Soap x24 Rs480\nTotal Rs2480', NOW() - INTERVAL '47 days') RETURNING id INTO b12;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '44 days') RETURNING id INTO b13;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'Amul Distributor\nAmul Butter 500g x20 Rs2000\nAmul Milk 1L x48 Rs2400\nAmul Cheese 200g x10 Rs1500\nTotal Rs5900', NOW() - INTERVAL '40 days') RETURNING id INTO b14;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '36 days') RETURNING id INTO b15;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'Pepsi Distributor\nPepsi 1L x24 Rs1440\nLays Classic x48 Rs1440\nKurkure x24 Rs480\nTotal Rs3360', NOW() - INTERVAL '32 days') RETURNING id INTO b16;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '29 days') RETURNING id INTO b17;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'ITC Distributor\nClassmate Notebooks x50 Rs2500\nSunfeast Biscuits x48 Rs960\nAshirwad Atta 5kg x20 Rs1800\nTotal Rs5260', NOW() - INTERVAL '25 days') RETURNING id INTO b18;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '22 days') RETURNING id INTO b19;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'Local Supplier\nOnion 20kg Rs600\nPotato 20kg Rs400\nTomato 10kg Rs300\nGarlic 5kg Rs250\nTotal Rs1550', NOW() - INTERVAL '18 days') RETURNING id INTO b20;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '15 days') RETURNING id INTO b21;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'Marico Distributor\nParachute Oil 500ml x24 Rs1440\nSaffola 1L x10 Rs1600\nNihar Naturals x12 Rs720\nTotal Rs3760', NOW() - INTERVAL '12 days') RETURNING id INTO b22;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '10 days') RETURNING id INTO b23;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'Colgate-Palmolive\nColgate 200g x24 Rs2400\nPalmolive Soap x24 Rs720\nColgate Mouthwash x12 Rs1800\nTotal Rs4920', NOW() - INTERVAL '8 days') RETURNING id INTO b24;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '6 days') RETURNING id INTO b25;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'COMPLETED', 'Godrej Distributor\nGood Knight x24 Rs1200\nCinthol Soap x24 Rs720\nGodrej No.1 Soap x24 Rs480\nTotal Rs2400', NOW() - INTERVAL '5 days') RETURNING id INTO b26;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'COMPLETED', NULL, NOW() - INTERVAL '3 days') RETURNING id INTO b27;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'UPLOADED',  'Dabur Distributor\nHajmola x50 Rs500\nRealJuice 1L x24 Rs1440\nVatika Oil x12 Rs960\nTotal Rs2900', NOW() - INTERVAL '2 days') RETURNING id INTO b28;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'manual',  'UPLOADED',  NULL, NOW() - INTERVAL '1 day') RETURNING id INTO b29;
INSERT INTO bills (id, user_id, store_id, source, status, ocr_text, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, 'ocr',     'PROCESSING','Nestle Distributor\nKitKat x48 Rs2400\nMaggi Masala x24 Rs1440\nMunch x48 Rs960\nTotal Rs4800', NOW() - INTERVAL '4 hours') RETURNING id INTO b30;


-- ============================================================
-- LEDGER ENTRIES (one per completed bill)
-- ============================================================
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b01, 'Shree Wholesale', NOW() - INTERVAL '88 days', 3200.00, 'Monthly grocery restock', NOW() - INTERVAL '88 days') RETURNING id INTO l01;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b02, 'Reliance Fresh',  NOW() - INTERVAL '84 days', 580.00,  'Staples restock', NOW() - INTERVAL '84 days') RETURNING id INTO l02;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b03, 'Ram Kishan Trading', NOW() - INTERVAL '80 days', 4500.00, 'Pulses and spices bulk order', NOW() - INTERVAL '80 days') RETURNING id INTO l03;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b04, 'BigBasket B2B', NOW() - INTERVAL '77 days', 600.00, 'Cooking essentials', NOW() - INTERVAL '77 days') RETURNING id INTO l04;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b05, 'Gupta Provisions', NOW() - INTERVAL '73 days', 2800.00, 'Snacks & beverages restock', NOW() - INTERVAL '73 days') RETURNING id INTO l05;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b06, 'D-Mart Wholesale', NOW() - INTERVAL '70 days', 455.00, 'Breakfast items', NOW() - INTERVAL '70 days') RETURNING id INTO l06;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b07, 'Star Trading Co', NOW() - INTERVAL '66 days', 6000.00, 'Festival season advance stock', NOW() - INTERVAL '66 days') RETURNING id INTO l07;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b08, 'Metro Cash & Carry', NOW() - INTERVAL '62 days', 929.00, 'Packaged food restock', NOW() - INTERVAL '62 days') RETURNING id INTO l08;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b09, 'Sharma Brothers', NOW() - INTERVAL '59 days', 3750.00, 'Household items bulk', NOW() - INTERVAL '59 days') RETURNING id INTO l09;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b10, 'Wholesale Agro Hub', NOW() - INTERVAL '55 days', 4000.00, 'Rice & atta bulk supply', NOW() - INTERVAL '55 days') RETURNING id INTO l10;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b11, 'Mehta Traders', NOW() - INTERVAL '51 days', 1800.00, 'Personal care replenishment', NOW() - INTERVAL '51 days') RETURNING id INTO l11;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b12, 'HUL Direct', NOW() - INTERVAL '47 days', 2480.00, 'Detergent & soap stock', NOW() - INTERVAL '47 days') RETURNING id INTO l12;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b13, 'Cold Chain Logistics', NOW() - INTERVAL '44 days', 2100.00, 'Dairy top-up', NOW() - INTERVAL '44 days') RETURNING id INTO l13;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b14, 'Amul Cooperative', NOW() - INTERVAL '40 days', 5900.00, 'Full dairy range', NOW() - INTERVAL '40 days') RETURNING id INTO l14;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b15, 'Singh Beverages', NOW() - INTERVAL '36 days', 2200.00, 'Soft drinks for wedding season', NOW() - INTERVAL '36 days') RETURNING id INTO l15;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b16, 'PepsiCo Distributor', NOW() - INTERVAL '32 days', 3360.00, 'Beverages & snacks', NOW() - INTERVAL '32 days') RETURNING id INTO l16;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b17, 'Kumar Stationery', NOW() - INTERVAL '29 days', 1500.00, 'Stationery & monthly misc', NOW() - INTERVAL '29 days') RETURNING id INTO l17;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b18, 'ITC Direct', NOW() - INTERVAL '25 days', 5260.00, 'ITC range full reorder', NOW() - INTERVAL '25 days') RETURNING id INTO l18;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b19, 'Patel Farms', NOW() - INTERVAL '22 days', 1550.00, 'Fresh vegetables wholesale', NOW() - INTERVAL '22 days') RETURNING id INTO l19;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b20, 'Local Mandi', NOW() - INTERVAL '18 days', 1550.00, 'Weekly vegetable restock', NOW() - INTERVAL '18 days') RETURNING id INTO l20;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b21, 'Verma Distributors', NOW() - INTERVAL '15 days', 3100.00, 'Hair & beauty care range', NOW() - INTERVAL '15 days') RETURNING id INTO l21;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b22, 'Marico Direct', NOW() - INTERVAL '12 days', 3760.00, 'Oil & hair care restock', NOW() - INTERVAL '12 days') RETURNING id INTO l22;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b23, 'Reddy Provisions', NOW() - INTERVAL '10 days', 2750.00, 'Mixed grocery top-up', NOW() - INTERVAL '10 days') RETURNING id INTO l23;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b24, 'Colgate Direct', NOW() - INTERVAL '8 days', 4920.00, 'Oral care & soap range', NOW() - INTERVAL '8 days') RETURNING id INTO l24;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b25, 'Jain Wholesale', NOW() - INTERVAL '6 days', 1200.00, 'Spice & condiment stock', NOW() - INTERVAL '6 days') RETURNING id INTO l25;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b26, 'Godrej Direct', NOW() - INTERVAL '5 days', 2400.00, 'Homecare range', NOW() - INTERVAL '5 days') RETURNING id INTO l26;
INSERT INTO ledger_entries (id, user_id, store_id, bill_id, merchant, transaction_date, total_amount, notes, created_at) VALUES
  (gen_random_uuid(), v_user, v_store, b27, 'Nandini Dairy', NOW() - INTERVAL '3 days', 1800.00, 'Dairy weekly top-up', NOW() - INTERVAL '3 days') RETURNING id INTO l27;


-- ============================================================
-- LINE ITEMS (varied items per ledger entry)
-- ============================================================
INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l01: Monthly grocery restock
  (l01, 'Basmati Rice',        25,   60.00,  1500.00),
  (l01, 'Wheat Atta (10kg)',    5,  200.00,  1000.00),
  (l01, 'Cooking Oil 1L',       5,  140.00,   700.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l02: Reliance Fresh
  (l02, 'Sona Masoori Rice 5kg', 1, 120.00, 120.00),
  (l02, 'Atta 10kg',             1, 350.00, 350.00),
  (l02, 'Toor Dal 1kg',          1, 110.00, 110.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l03: Pulses & spices
  (l03, 'Chana Dal 1kg',    10, 115.00, 1150.00),
  (l03, 'Moong Dal 1kg',    10, 130.00, 1300.00),
  (l03, 'Turmeric 200g',    20,  30.00,  600.00),
  (l03, 'Coriander Powder', 20,  22.50,  450.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l04: Cooking essentials
  (l04, 'Maida 5kg',        1, 200.00, 200.00),
  (l04, 'Sugar 5kg',        1, 230.00, 230.00),
  (l04, 'Salt 1kg',         1,  20.00,  20.00),
  (l04, 'Mustard Oil 1L',   1, 150.00, 150.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l05: Snacks & beverages
  (l05, 'Parle-G 250g',    24,  30.00,  720.00),
  (l05, 'Thums Up 1.25L',  24,  45.00, 1080.00),
  (l05, 'Kurkure 45g',     24,  20.00,  480.00),
  (l05, 'Hide & Seek 100g',12,  43.33,  520.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l06: Breakfast
  (l06, 'Poha 500g',        2,  45.00,  90.00),
  (l06, 'Toor Dal 2kg',     1, 240.00, 240.00),
  (l06, 'Suji 1kg',         1,  55.00,  55.00),
  (l06, 'Chana Dal 1kg',    1, 115.00, 115.00) -- (rounding for display, orig Rs455 close enough)
  ;

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l07: Festival bulk
  (l07, 'Kaju 500g',        4, 400.00, 1600.00),
  (l07, 'Badam 500g',       4, 350.00, 1400.00),
  (l07, 'Raisins 500g',     4, 150.00,  600.00),
  (l07, 'Pista 250g',       4, 100.00,  400.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l08: Packaged food
  (l08, 'Parle-G 50pk',    1, 600.00, 600.00),
  (l08, 'Maggi Masala 12pk',1, 144.00, 144.00),
  (l08, 'Brooke Bond Tea 500g',1, 185.00, 185.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l09: Household
  (l09, 'Harpic 1L',        6, 125.00,  750.00),
  (l09, 'Lizol 1L',         6, 125.00,  750.00),
  (l09, 'Scotch Brite Pad', 12,  20.83, 250.00),
  (l09, 'Vim Bar 200g',     24,  20.83, 500.00),
  (l09, 'Broom',            12,  41.67, 500.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l10: Rice & Atta bulk
  (l10, 'Sona Masoori Rice 50kg', 1, 2200.00, 2200.00),
  (l10, 'Ashirwad Atta 50kg',     1, 1800.00, 1800.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l11: Personal care
  (l11, 'Dove Shampoo 180ml',  12,  70.00,  840.00),
  (l11, 'Pantene 180ml',       12,  70.00,  840.00),
  (l11, 'Dettol Soap 75g',     12,  10.00,  120.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l12: Detergent & soap
  (l12, 'Surf Excel 1kg',   10, 150.00, 1500.00),
  (l12, 'Rin 500g',         10,  50.00,  500.00),
  (l12, 'Lifebuoy Soap 75g',24,  20.00,  480.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l13: Dairy top-up
  (l13, 'Amul Butter 500g',  6, 250.00, 1500.00),
  (l13, 'Amul Gold Milk 1L', 12,  50.00,  600.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l14: Full dairy
  (l14, 'Amul Butter 500g',  20, 100.00, 2000.00),
  (l14, 'Amul Milk 1L',      48,  50.00, 2400.00),
  (l14, 'Amul Cheese 200g',  10, 150.00, 1500.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l15: Soft drinks
  (l15, 'Coca Cola 1.25L',   24,  50.00, 1200.00),
  (l15, 'Sprite 1.25L',      24,  41.67, 1000.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l16: Beverages & snacks
  (l16, 'Pepsi 1L',          24,  60.00, 1440.00),
  (l16, 'Lays Classic 26g',  48,  30.00, 1440.00),
  (l16, 'Kurkure 45g',       24,  20.00,  480.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l17: Stationery
  (l17, 'Classmate Notebook A4', 24,  50.00, 1200.00),
  (l17, 'Ballpoint Pens 10pk',    6,  50.00,  300.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l18: ITC range
  (l18, 'Classmate Notebook',  50,  50.00, 2500.00),
  (l18, 'Sunfeast Biscuits',   48,  20.00,  960.00),
  (l18, 'Ashirwad Atta 5kg',   20,  90.00, 1800.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l19: Fresh vegetables
  (l19, 'Onion',  20,  30.00,  600.00),
  (l19, 'Potato', 20,  20.00,  400.00),
  (l19, 'Tomato', 10,  30.00,  300.00),
  (l19, 'Garlic',  5,  50.00,  250.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l20: Weekly veg
  (l20, 'Onion',  20,  30.00,  600.00),
  (l20, 'Potato', 20,  20.00,  400.00),
  (l20, 'Tomato', 10,  30.00,  300.00),
  (l20, 'Garlic',  5,  50.00,  250.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l21: Hair & beauty
  (l21, 'Parachute Oil 500ml', 12, 120.00, 1440.00),
  (l21, 'Vatika Shampoo 200ml',12,  80.00,  960.00),
  (l21, 'Head & Shoulders 180ml',12, 58.33, 700.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l22: Oil & hair care
  (l22, 'Parachute Oil 500ml', 24,  60.00, 1440.00),
  (l22, 'Saffola Gold 1L',     10, 160.00, 1600.00),
  (l22, 'Nihar Naturals 500ml',12,  60.00,  720.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l23: Mixed grocery
  (l23, 'Basmati Rice 1kg',   10,  80.00,  800.00),
  (l23, 'Chana Dal 1kg',      10, 115.00, 1150.00),
  (l23, 'Sona Masoori 5kg',    2, 130.00,  260.00); -- slight rounding

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l24: Oral care & soap
  (l24, 'Colgate Toothpaste 200g', 24, 100.00, 2400.00),
  (l24, 'Palmolive Soap 90g',      24,  30.00,  720.00),
  (l24, 'Colgate Mouthwash 500ml', 12, 150.00, 1800.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l25: Spice & condiment
  (l25, 'Maggi Hot Sweet Sauce 400g', 12,  50.00,  600.00),
  (l25, 'MDH Chaat Masala 100g',      12,  50.00,  600.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l26: Home care
  (l26, 'Good Knight Refill 45ml', 24, 50.00, 1200.00),
  (l26, 'Cinthol Soap 100g',       24, 30.00,  720.00),
  (l26, 'Godrej No.1 Soap 100g',   24, 20.00,  480.00);

INSERT INTO line_items (ledger_entry_id, product_name, quantity, unit_price, total_price) VALUES
  -- l27: Dairy weekly
  (l27, 'Nandini Milk 1L',     24,  45.00, 1080.00),
  (l27, 'Nandini Curd 500g',   12,  60.00,  720.00);


-- ============================================================
-- STOCK ITEMS (35 SKUs reflecting a typical kirana)
-- ============================================================
INSERT INTO stock_items (store_id, user_id, product_name, quantity, unit, cost_price) VALUES
  (v_store, v_user, 'Basmati Rice',            45.00,  'kg',     80.00),
  (v_store, v_user, 'Sona Masoori Rice',       120.00, 'kg',     50.00),
  (v_store, v_user, 'Wheat Atta (5kg)',          18.00, 'bags',  190.00),
  (v_store, v_user, 'Toor Dal',                 30.00,  'kg',    115.00),
  (v_store, v_user, 'Chana Dal',                25.00,  'kg',    110.00),
  (v_store, v_user, 'Moong Dal',                20.00,  'kg',    130.00),
  (v_store, v_user, 'Urad Dal',                 15.00,  'kg',    105.00),
  (v_store, v_user, 'Sugar',                    50.00,  'kg',     42.00),
  (v_store, v_user, 'Salt (1kg)',               40.00, 'packs',   20.00),
  (v_store, v_user, 'Mustard Oil (1L)',          24.00, 'bottles',150.00),
  (v_store, v_user, 'Saffola Oil (1L)',          12.00, 'bottles',160.00),
  (v_store, v_user, 'Parachute Coconut Oil 500ml', 20.00,'bottles',62.00),
  (v_store, v_user, 'Amul Butter (500g)',        10.00, 'packs', 250.00),
  (v_store, v_user, 'Amul Cheese Slices',        8.00,  'packs', 150.00),
  (v_store, v_user, 'Parle-G (250g)',            48.00, 'packs',  12.50),
  (v_store, v_user, 'Sunfeast Marie',            36.00, 'packs',  20.00),
  (v_store, v_user, 'Maggi Noodles 70g',         60.00, 'packs',  14.00),
  (v_store, v_user, 'Kurkure 45g',               72.00, 'packs',  20.00),
  (v_store, v_user, 'Lays Classic 26g',          60.00, 'packs',  20.00),
  (v_store, v_user, 'Coca Cola 1.25L',           24.00, 'bottles',55.00),
  (v_store, v_user, 'Pepsi 1L',                  24.00, 'bottles',42.00),
  (v_store, v_user, 'Thums Up 1.25L',            24.00, 'bottles',55.00),
  (v_store, v_user, 'Surf Excel 1kg',            20.00, 'packs', 150.00),
  (v_store, v_user, 'Rin Bar 200g',              30.00, 'bars',   22.00),
  (v_store, v_user, 'Lifebuoy Soap 75g',         36.00, 'bars',   18.00),
  (v_store, v_user, 'Dove Soap 75g',             24.00, 'bars',   42.00),
  (v_store, v_user, 'Colgate Toothpaste 200g',   24.00, 'tubes',  90.00),
  (v_store, v_user, 'Dettol Handwash 250ml',     12.00, 'bottles',85.00),
  (v_store, v_user, 'Good Knight Refill 45ml',   24.00, 'packs',  50.00),
  (v_store, v_user, 'Turmeric Powder 200g',      20.00, 'packs',  30.00),
  (v_store, v_user, 'Red Chilli Powder 200g',    20.00, 'packs',  35.00),
  (v_store, v_user, 'Coriander Powder 200g',     20.00, 'packs',  28.00),
  (v_store, v_user, 'Onion',                     30.00, 'kg',     28.00),
  (v_store, v_user, 'Potato',                    40.00, 'kg',     18.00),
  (v_store, v_user, 'Tomato',                    15.00, 'kg',     25.00)
ON CONFLICT (store_id, product_name) DO UPDATE
  SET quantity   = EXCLUDED.quantity,
      unit       = EXCLUDED.unit,
      cost_price = EXCLUDED.cost_price,
      updated_at = NOW();


-- ============================================================
-- AI INSIGHTS (cached tips for the store)
-- ============================================================
INSERT INTO ai_insights (store_id, type, data, ledger_count_at_generation) VALUES
  (v_store, 'forecast', '{
    "summary": "Based on your last 90 days, your top revenue drivers are Rice, Atta, and Cooking Oil. Sales spike every Friday and on the 1st of the month.",
    "recommendations": [
      "Increase Basmati Rice stock by 20% before month-end",
      "Bundle Sugar + Atta for a combo offer to boost basket size",
      "Expect a 30% demand jump in Dairy products next month due to local festival Holi"
    ],
    "forecast_30d": {
      "Rice":        {"expected_units": 200, "confidence": 0.88},
      "Atta":        {"expected_units": 80,  "confidence": 0.85},
      "Cooking_Oil": {"expected_units": 60,  "confidence": 0.80},
      "Dal":         {"expected_units": 120, "confidence": 0.82},
      "Snacks":      {"expected_units": 300, "confidence": 0.76}
    }
  }', 27),
  (v_store, 'inventory', '{
    "summary": "You have 3 items running critically low. Reorder soon to avoid stockouts.",
    "low_stock": [
      {"product": "Amul Cheese Slices", "current_qty": 8,  "reorder_level": 10, "urgency": "high"},
      {"product": "Dettol Handwash 250ml", "current_qty": 12, "reorder_level": 15, "urgency": "medium"},
      {"product": "Tomato", "current_qty": 15, "reorder_level": 20, "urgency": "medium"}
    ],
    "overstock_warning": [
      {"product": "Sona Masoori Rice", "current_qty": 120, "days_cover": 45, "suggestion": "Offer 5% discount to move stock faster"}
    ],
    "recommendations": [
      "Place Amul dairy reorder by tomorrow",
      "Consider reducing Sona Masoori order next cycle by 25%",
      "Add Masoor Dal to your range — missing from current stock"
    ]
  }', 27),
  (v_store, 'festival', '{
    "summary": "Holi is in 3 weeks. Historically your sales jump 40% in the week before Holi.",
    "upcoming_festivals": [
      {
        "name": "Holi",
        "date": "2026-03-17",
        "days_away": 19,
        "high_demand_items": ["Colors/Gulal", "Mathri", "Gujiya Maida", "Thandai Mix", "Sugar", "Dahi"],
        "suggested_stock_increase": "40%"
      },
      {
        "name": "Navratri",
        "date": "2026-04-02",
        "days_away": 35,
        "high_demand_items": ["Sabudana", "Singhada Atta", "Rock Salt", "Peanuts", "Makhana"],
        "suggested_stock_increase": "25%"
      }
    ],
    "action_items": [
      "Order Colors/Gulal packets from supplier by Feb 28",
      "Double Sugar stock before Holi week",
      "Stock Sabudana 30 days before Navratri"
    ]
  }', 27)
ON CONFLICT (store_id, type) DO UPDATE
  SET data                     = EXCLUDED.data,
      generated_at             = NOW(),
      ledger_count_at_generation = EXCLUDED.ledger_count_at_generation;


RAISE NOTICE 'Seed complete — 30 bills, 27 ledger entries, ~80 line items, 35 stock SKUs, 3 AI insights inserted for Test User.';
END $$;
