-- Travel Memory AI Director v7. Back up blog_user_db before executing.
-- Requires v6 ai_director_video_work. No existing MP4 is automatically public.
CREATE TABLE IF NOT EXISTS ai_director_video_share (
    work_id CHAR(36) NOT NULL,
    share_token VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NULL,
    is_public TINYINT(1) NOT NULL DEFAULT 0,
    published_at DATETIME(3) NULL,
    PRIMARY KEY (work_id),
    UNIQUE KEY uq_ai_director_share_token (share_token),
    CONSTRAINT fk_ai_director_share_work FOREIGN KEY (work_id)
      REFERENCES ai_director_video_work(id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
