-- Catálogo personal de platos
CREATE TABLE IF NOT EXISTS meals (
    id           SERIAL PRIMARY KEY,
    name         TEXT NOT NULL,
    meal_type    TEXT NOT NULL CHECK (meal_type IN ('breakfast', 'lunch', 'dinner')),
    ingredients  TEXT[] NOT NULL DEFAULT '{}',
    tags         TEXT[] NOT NULL DEFAULT '{}',
    prep_time    INTEGER,
    ai_generated BOOLEAN DEFAULT false,
    created_at   TIMESTAMP DEFAULT now()
);

-- Despensa (lo que tienes en casa ahora)
CREATE TABLE IF NOT EXISTS pantry (
    id         SERIAL PRIMARY KEY,
    item_name  TEXT NOT NULL UNIQUE,
    sufficient BOOLEAN DEFAULT true,
    updated_at TIMESTAMP DEFAULT now()
);

-- Menús generados (historial)
CREATE TABLE IF NOT EXISTS weekly_menus (
    id                SERIAL PRIMARY KEY,
    week_start        DATE NOT NULL,
    context           TEXT,
    budget            DECIMAL(6,2),
    menu_data         JSONB NOT NULL,
    shopping_list     JSONB,
    recommended_super TEXT,
    estimated_cost    DECIMAL(6,2),
    created_at        TIMESTAMP DEFAULT now()
);

-- Docs de ofertas subidos por el usuario esta semana
CREATE TABLE IF NOT EXISTS weekly_deals (
    id          SERIAL PRIMARY KEY,
    week_start  DATE NOT NULL,
    supermarket TEXT NOT NULL,
    raw_text    TEXT NOT NULL,
    uploaded_at TIMESTAMP DEFAULT now(),
    UNIQUE (week_start, supermarket)
);

-- Seed de platos de ejemplo
INSERT INTO meals (name, meal_type, ingredients, tags, prep_time) VALUES
('Porridge con plátano',        'breakfast', ARRAY['oats','banana','milk'],                  ARRAY['quick','cheap'],        10),
('Tostadas con huevo revuelto', 'breakfast', ARRAY['bread','eggs','butter'],                 ARRAY['quick','gym'],          10),
('Yogur con granola',           'breakfast', ARRAY['yogurt','granola','honey'],              ARRAY['quick','cheap'],         5),
('Pollo con arroz y espinacas', 'lunch',     ARRAY['chicken','rice','spinach','olive oil'],  ARRAY['gym','batch-cook'],     25),
('Pasta con tomate y atún',     'lunch',     ARRAY['pasta','tomato sauce','tuna'],           ARRAY['quick','cheap'],        15),
('Lentejas con verduras',       'lunch',     ARRAY['lentils','carrot','onion','tomato'],     ARRAY['cheap','batch-cook'],   35),
('Tortilla francesa',           'dinner',    ARRAY['eggs','olive oil','salt'],               ARRAY['quick','cheap'],        10),
('Salmón al horno',             'dinner',    ARRAY['salmon','lemon','garlic','olive oil'],   ARRAY['gym'],                  20),
('Ensalada con atún',           'dinner',    ARRAY['lettuce','tomato','tuna','olive oil'],   ARRAY['quick','cheap'],        10)
ON CONFLICT DO NOTHING;
