-- Tutorial database: маркетплейс-подобная схема (Marpla/Wildberries-like)
-- Используется для практики PostgreSQL MCP, агентов, RAG

-- =============================================================================
-- SCHEMA
-- =============================================================================

CREATE TABLE categories (
    id SERIAL PRIMARY KEY,
    name VARCHAR(100) NOT NULL,
    parent_id INT REFERENCES categories(id),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE sellers (
    id SERIAL PRIMARY KEY,
    name VARCHAR(200) NOT NULL,
    rating NUMERIC(3,2) NOT NULL CHECK (rating BETWEEN 0 AND 5),
    total_sales INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE products (
    id SERIAL PRIMARY KEY,
    name VARCHAR(300) NOT NULL,
    description TEXT,
    price NUMERIC(10,2) NOT NULL CHECK (price > 0),
    category_id INT NOT NULL REFERENCES categories(id),
    seller_id INT NOT NULL REFERENCES sellers(id),
    rating NUMERIC(3,2) CHECK (rating BETWEEN 0 AND 5),
    review_count INT NOT NULL DEFAULT 0,
    stock INT NOT NULL DEFAULT 0,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE reviews (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id),
    rating INT NOT NULL CHECK (rating BETWEEN 1 AND 5),
    comment TEXT,
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE TABLE orders (
    id SERIAL PRIMARY KEY,
    product_id INT NOT NULL REFERENCES products(id),
    quantity INT NOT NULL CHECK (quantity > 0),
    total_price NUMERIC(10,2) NOT NULL,
    status VARCHAR(20) NOT NULL CHECK (status IN ('pending', 'paid', 'shipped', 'delivered', 'cancelled')),
    created_at TIMESTAMP DEFAULT NOW()
);

CREATE INDEX idx_products_category ON products(category_id);
CREATE INDEX idx_products_seller ON products(seller_id);
CREATE INDEX idx_products_rating ON products(rating DESC);
CREATE INDEX idx_reviews_product ON reviews(product_id);
CREATE INDEX idx_orders_product ON orders(product_id);
CREATE INDEX idx_orders_created ON orders(created_at DESC);

-- =============================================================================
-- CATEGORIES (иерархия)
-- =============================================================================

INSERT INTO categories (id, name, parent_id) VALUES
    (1, 'Электроника', NULL),
    (2, 'Смартфоны', 1),
    (3, 'Ноутбуки', 1),
    (4, 'Аудио', 1),
    (5, 'Одежда', NULL),
    (6, 'Мужская одежда', 5),
    (7, 'Женская одежда', 5),
    (8, 'Дом и быт', NULL),
    (9, 'Техника для кухни', 8),
    (10, 'Освещение', 8),
    (11, 'Спорт', NULL),
    (12, 'Фитнес', 11),
    (13, 'Туризм', 11);

SELECT setval('categories_id_seq', 13);

-- =============================================================================
-- SELLERS
-- =============================================================================

INSERT INTO sellers (name, rating, total_sales) VALUES
    ('ТехноПлюс', 4.8, 15420),
    ('МегаМаркет', 4.5, 9830),
    ('ЭлектроМир', 4.9, 22150),
    ('СтильОдежда', 4.3, 6420),
    ('Модный Дом', 4.6, 8210),
    ('Fashion Trend', 4.1, 4560),
    ('ДомМастер', 4.7, 11240),
    ('УютныйДом', 4.4, 5830),
    ('СпортПро', 4.8, 13670),
    ('АктивЛайф', 4.2, 3890),
    ('Gadget Store', 3.9, 2450),
    ('Premium Electronics', 5.0, 18900),
    ('Дешевле некуда', 3.5, 1200),
    ('Russian Brand', 4.6, 7820),
    ('Китай-Оптом', 3.2, 890);

-- =============================================================================
-- PRODUCTS
-- =============================================================================

-- Смартфоны (category 2)
INSERT INTO products (name, description, price, category_id, seller_id, rating, review_count, stock) VALUES
    ('iPhone 15 Pro 256GB', 'Флагманский смартфон Apple с чипом A17 Pro и титановым корпусом', 124990, 2, 12, 4.9, 342, 15),
    ('iPhone 15 128GB', 'Смартфон Apple с камерой 48 Мп и USB-C', 79990, 2, 12, 4.8, 567, 24),
    ('Samsung Galaxy S24 Ultra', 'Флагман Samsung с AI-функциями и S Pen', 109990, 2, 1, 4.7, 289, 8),
    ('Samsung Galaxy A55', 'Среднебюджетный смартфон с OLED-дисплеем', 34990, 2, 1, 4.5, 156, 45),
    ('Xiaomi Redmi Note 13 Pro', 'Смартфон с камерой 200 Мп по доступной цене', 22990, 2, 11, 4.3, 432, 67),
    ('Xiaomi 14 Ultra', 'Флагман Xiaomi с оптикой Leica', 89990, 2, 3, 4.6, 78, 12),
    ('Google Pixel 8 Pro', 'Смартфон Google с лучшей в своём классе камерой', 79990, 2, 3, 4.7, 145, 6),
    ('OnePlus 12', 'Смартфон с Snapdragon 8 Gen 3 и быстрой зарядкой', 69990, 2, 11, 4.4, 89, 18),
    ('Honor 90 Pro', 'Смартфон с 200 Мп камерой', 39990, 2, 1, 4.2, 234, 30),
    ('Nothing Phone 2', 'Смартфон с уникальным дизайном Glyph Interface', 54990, 2, 3, 4.5, 67, 9);

-- Ноутбуки (category 3)
INSERT INTO products (name, description, price, category_id, seller_id, rating, review_count, stock) VALUES
    ('MacBook Air M3 13"', 'Ультрабук Apple с чипом M3 и 8 ГБ ОЗУ', 129990, 3, 12, 4.9, 245, 20),
    ('MacBook Pro 14" M3 Pro', 'Профессиональный ноутбук для разработчиков и дизайнеров', 199990, 3, 12, 4.9, 189, 7),
    ('ASUS ROG Strix G16', 'Игровой ноутбук с RTX 4070 и Intel i7', 149990, 3, 1, 4.6, 78, 5),
    ('Lenovo ThinkPad X1 Carbon', 'Бизнес-ультрабук с 14" OLED экраном', 174990, 3, 3, 4.8, 134, 11),
    ('HP Pavilion 15', 'Ноутбук для учёбы и работы', 64990, 3, 2, 4.2, 456, 34),
    ('Dell XPS 15', 'Премиум-ультрабук для профессионалов', 189990, 3, 3, 4.7, 98, 6),
    ('Acer Nitro 5', 'Бюджетный игровой ноутбук', 74990, 3, 2, 4.0, 234, 28),
    ('Huawei MateBook 14', 'Лёгкий ноутбук с сенсорным экраном', 89990, 3, 11, 4.3, 67, 15);

-- Аудио (category 4)
INSERT INTO products (name, description, price, category_id, seller_id, rating, review_count, stock) VALUES
    ('AirPods Pro 2', 'Беспроводные наушники Apple с активным шумоподавлением', 24990, 4, 12, 4.8, 678, 50),
    ('Sony WH-1000XM5', 'Полноразмерные наушники с лучшим шумоподавлением', 34990, 4, 3, 4.9, 456, 22),
    ('Bose QuietComfort 45', 'Наушники с комфортной посадкой и мощным звуком', 29990, 4, 3, 4.7, 234, 18),
    ('JBL Tune 760NC', 'Бюджетные наушники с ANC', 7990, 4, 2, 4.3, 789, 120),
    ('Marshall Major IV', 'Портативные наушники с фирменным дизайном', 12990, 4, 1, 4.5, 145, 33),
    ('Sennheiser HD 600', 'Открытые наушники для аудиофилов', 39990, 4, 12, 4.8, 67, 8),
    ('Sony WF-1000XM5', 'Беспроводные наушники-вкладыши топового класса', 26990, 4, 3, 4.6, 123, 15),
    ('Xiaomi Buds 4 Pro', 'Беспроводные наушники от Xiaomi', 9990, 4, 11, 4.2, 345, 80);

-- Мужская одежда (category 6)
INSERT INTO products (name, description, price, category_id, seller_id, rating, review_count, stock) VALUES
    ('Футболка базовая белая', 'Классическая футболка из 100% хлопка', 990, 6, 4, 4.4, 1234, 450),
    ('Джинсы классические синие', 'Прямые джинсы из денима', 2990, 6, 5, 4.5, 678, 230),
    ('Рубашка офисная', 'Белая рубашка приталенного кроя', 2490, 6, 5, 4.3, 345, 120),
    ('Куртка зимняя', 'Тёплая куртка с мембраной', 8990, 6, 14, 4.6, 234, 45),
    ('Свитер вязаный', 'Мужской свитер из шерсти', 3490, 6, 14, 4.5, 156, 67),
    ('Брюки карго', 'Брюки с большими карманами', 3990, 6, 6, 4.2, 89, 34),
    ('Шорты спортивные', 'Летние шорты для тренировок', 1490, 6, 6, 4.1, 567, 180);

-- Женская одежда (category 7)
INSERT INTO products (name, description, price, category_id, seller_id, rating, review_count, stock) VALUES
    ('Платье летнее', 'Платье миди из вискозы', 3490, 7, 5, 4.6, 789, 89),
    ('Джинсы скинни', 'Обтягивающие джинсы', 2990, 7, 5, 4.4, 567, 145),
    ('Блузка офисная', 'Блузка из шёлка', 2490, 7, 5, 4.5, 234, 78),
    ('Пальто осеннее', 'Классическое пальто из шерсти', 12990, 7, 14, 4.7, 156, 23),
    ('Свитер оверсайз', 'Свободный свитер', 2990, 7, 6, 4.3, 345, 90),
    ('Юбка миди', 'Юбка-карандаш', 2490, 7, 5, 4.4, 123, 56);

-- Техника для кухни (category 9)
INSERT INTO products (name, description, price, category_id, seller_id, rating, review_count, stock) VALUES
    ('Кофемашина DeLonghi', 'Автоматическая кофемашина с капучинатором', 49990, 9, 7, 4.8, 234, 12),
    ('Блендер Bosch', 'Погружной блендер 800 Вт', 4990, 9, 7, 4.5, 567, 45),
    ('Тостер Tefal', 'Тостер на 2 ломтика', 2990, 9, 8, 4.3, 234, 78),
    ('Мультиварка Redmond', 'Мультиварка на 5 литров', 6990, 9, 8, 4.6, 456, 34),
    ('Чайник электрический', 'Стеклянный чайник с подсветкой', 2490, 9, 8, 4.4, 789, 120),
    ('Микроволновая печь Samsung', 'СВЧ-печь с грилем', 12990, 9, 7, 4.5, 234, 28);

-- Освещение (category 10)
INSERT INTO products (name, description, price, category_id, seller_id, rating, review_count, stock) VALUES
    ('Люстра потолочная', 'Современная LED-люстра', 5990, 10, 8, 4.4, 123, 18),
    ('Торшер напольный', 'Стильный торшер для гостиной', 4990, 10, 7, 4.5, 89, 22),
    ('Настольная лампа', 'Лампа с регулируемой яркостью', 1990, 10, 8, 4.3, 345, 65);

-- Фитнес (category 12)
INSERT INTO products (name, description, price, category_id, seller_id, rating, review_count, stock) VALUES
    ('Беговая дорожка', 'Складная беговая дорожка для дома', 49990, 12, 9, 4.7, 145, 8),
    ('Велотренажёр', 'Магнитный велотренажёр', 29990, 12, 9, 4.5, 89, 12),
    ('Гантели разборные', 'Набор гантелей 2х10 кг', 3490, 12, 9, 4.6, 456, 67),
    ('Коврик для йоги', 'Нескользящий коврик 6 мм', 1490, 12, 10, 4.4, 678, 150),
    ('Эспандер кистевой', 'Регулируемый эспандер', 490, 12, 10, 4.2, 234, 340);

-- Туризм (category 13)
INSERT INTO products (name, description, price, category_id, seller_id, rating, review_count, stock) VALUES
    ('Палатка 3-местная', 'Туристическая палатка с тамбуром', 8990, 13, 9, 4.6, 234, 23),
    ('Спальный мешок', 'Спальник для температур до -5°C', 4990, 13, 9, 4.5, 156, 45),
    ('Рюкзак трекинговый 60л', 'Рюкзак для многодневных походов', 7990, 13, 10, 4.7, 89, 18),
    ('Термос 1л', 'Вакуумный термос из нержавейки', 1990, 13, 10, 4.4, 456, 120);

-- =============================================================================
-- REVIEWS (примеры для разных товаров)
-- =============================================================================

INSERT INTO reviews (product_id, rating, comment) VALUES
    (1, 5, 'Отличный телефон, камера просто космос!'),
    (1, 5, 'Купил на замену iPhone 12, разница колоссальная'),
    (1, 4, 'Дорого, но качество того стоит'),
    (1, 5, 'Титан смотрится премиально, в руке лежит идеально'),
    (2, 5, 'Для своей цены — топ. Камера впечатляет'),
    (2, 4, 'USB-C это прорыв для Apple'),
    (3, 5, 'S Pen очень удобен, снова вернулся к Samsung'),
    (3, 5, 'AI-функции реально полезные'),
    (4, 4, 'Хороший середняк, за свои деньги огонь'),
    (5, 4, 'Камера обычно завышена, но звук и батарея отличные'),
    (11, 5, 'M3 летает, автономность невероятная'),
    (11, 5, 'Идеальный ноут для кодинга'),
    (12, 5, 'Для профи — лучший выбор'),
    (18, 5, 'Звук бомба, ANC лучшее что пробовал'),
    (19, 5, 'Король шумоподавления, беру уже 3-ю модель'),
    (26, 5, 'Базовая белая футболка — must have'),
    (27, 4, 'Джинсы отличные, сели как влитые'),
    (34, 5, 'Платье прекрасное, ношу не снимая'),
    (40, 5, 'Кофемашина топ, кофе как в кофейне'),
    (50, 4, 'Гантели удобные, компактно хранятся');

-- =============================================================================
-- ORDERS (история продаж)
-- =============================================================================

INSERT INTO orders (product_id, quantity, total_price, status, created_at) VALUES
    (1, 1, 124990, 'delivered', NOW() - INTERVAL '30 days'),
    (1, 1, 124990, 'shipped', NOW() - INTERVAL '2 days'),
    (1, 1, 124990, 'delivered', NOW() - INTERVAL '15 days'),
    (2, 1, 79990, 'delivered', NOW() - INTERVAL '20 days'),
    (2, 1, 79990, 'paid', NOW() - INTERVAL '1 day'),
    (3, 1, 109990, 'delivered', NOW() - INTERVAL '10 days'),
    (5, 2, 45980, 'delivered', NOW() - INTERVAL '7 days'),
    (5, 1, 22990, 'shipped', NOW() - INTERVAL '1 day'),
    (11, 1, 129990, 'delivered', NOW() - INTERVAL '45 days'),
    (11, 1, 129990, 'paid', NOW() - INTERVAL '3 days'),
    (18, 2, 49980, 'delivered', NOW() - INTERVAL '5 days'),
    (19, 1, 34990, 'shipped', NOW() - INTERVAL '2 days'),
    (26, 5, 4950, 'delivered', NOW() - INTERVAL '15 days'),
    (26, 3, 2970, 'delivered', NOW() - INTERVAL '10 days'),
    (27, 1, 2990, 'pending', NOW() - INTERVAL '1 day'),
    (34, 1, 3490, 'delivered', NOW() - INTERVAL '8 days'),
    (40, 1, 49990, 'delivered', NOW() - INTERVAL '25 days'),
    (42, 1, 6990, 'cancelled', NOW() - INTERVAL '12 days'),
    (50, 1, 3490, 'delivered', NOW() - INTERVAL '60 days'),
    (50, 2, 6980, 'delivered', NOW() - INTERVAL '40 days');

-- =============================================================================
-- VIEWS (удобные представления для агента)
-- =============================================================================

CREATE VIEW products_with_details AS
SELECT
    p.id,
    p.name,
    p.description,
    p.price,
    p.rating,
    p.review_count,
    p.stock,
    c.name AS category,
    s.name AS seller_name,
    s.rating AS seller_rating
FROM products p
JOIN categories c ON c.id = p.category_id
JOIN sellers s ON s.id = p.seller_id;

CREATE VIEW top_sellers AS
SELECT
    s.id,
    s.name,
    s.rating,
    s.total_sales,
    COUNT(p.id) AS products_count,
    AVG(p.rating) AS avg_product_rating
FROM sellers s
LEFT JOIN products p ON p.seller_id = s.id
GROUP BY s.id, s.name, s.rating, s.total_sales
ORDER BY s.total_sales DESC;

CREATE VIEW category_stats AS
SELECT
    c.id,
    c.name,
    COUNT(p.id) AS products_count,
    AVG(p.price) AS avg_price,
    MIN(p.price) AS min_price,
    MAX(p.price) AS max_price,
    AVG(p.rating) AS avg_rating
FROM categories c
LEFT JOIN products p ON p.category_id = c.id
GROUP BY c.id, c.name
ORDER BY products_count DESC;

-- =============================================================================
-- READONLY USER для безопасного доступа агента
-- =============================================================================

CREATE USER agent_readonly WITH PASSWORD 'readonly_pass';
GRANT CONNECT ON DATABASE tutorial_db TO agent_readonly;
GRANT USAGE ON SCHEMA public TO agent_readonly;
GRANT SELECT ON ALL TABLES IN SCHEMA public TO agent_readonly;
ALTER DEFAULT PRIVILEGES IN SCHEMA public GRANT SELECT ON TABLES TO agent_readonly;

-- =============================================================================
-- SUMMARY
-- =============================================================================

-- 13 категорий (3 корневые + 10 подкатегорий)
-- 15 селлеров (с разными рейтингами и продажами)
-- 55 товаров в 8 подкатегориях
-- 20 отзывов
-- 20 заказов (разные статусы, разное время)
-- 3 VIEW для удобной аналитики
-- Readonly user для безопасного агента
