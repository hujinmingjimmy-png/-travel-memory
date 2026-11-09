-- Travel Memory AI Director v2 - run this in the project's existing MySQL database.
-- Confirm the selected schema with SELECT DATABASE(); and back it up first.
-- No existing user / journey / image data is deleted or updated.
CREATE TABLE IF NOT EXISTS ai_director_draft (
    travel_id BIGINT NOT NULL,
    owner_user_id BIGINT NOT NULL,
    revision INT NOT NULL DEFAULT 1,
    draft_json JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (travel_id),
    KEY idx_ai_director_owner (owner_user_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

-- Verify after execution:
-- SHOW COLUMNS FROM ai_director_draft;
-- SELECT COUNT(*) FROM ai_director_draft;
