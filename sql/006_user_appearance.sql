-- v18: one row per authenticated account. Run once before enabling appearance settings.
CREATE TABLE IF NOT EXISTS tm_user_appearance (
  user_id BIGINT NOT NULL PRIMARY KEY,
  overlay_percent TINYINT UNSIGNED NOT NULL DEFAULT 15,
  position_x TINYINT UNSIGNED NOT NULL DEFAULT 50,
  position_y TINYINT UNSIGNED NOT NULL DEFAULT 50,
  image_name VARCHAR(64) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
