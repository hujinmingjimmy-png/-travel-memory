-- Travel Memory AI Director v6: permanent private MP4 works library.
-- Select your existing blog_user_db database and back it up before executing.
-- No automatic SQL execution by the installation script.
CREATE TABLE IF NOT EXISTS ai_director_video_work (
    id CHAR(36) NOT NULL,
    owner_user_id BIGINT NOT NULL,
    travel_id BIGINT NOT NULL,
    source_job_id CHAR(36) NOT NULL,
    title VARCHAR(100) NOT NULL,
    file_bytes BIGINT NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (id),
    UNIQUE KEY uq_director_video_job (owner_user_id, travel_id, source_job_id),
    KEY idx_director_video_owner_travel_time (owner_user_id, travel_id, created_at)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
