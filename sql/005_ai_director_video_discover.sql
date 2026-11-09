-- Travel Memory v8: Discover visibility is a SECOND, independent opt-in.
-- Run in the existing blog_user_db after database backup and v6/v7 migrations.
-- No v7 share-by-link video automatically appears in Discover.
CREATE TABLE IF NOT EXISTS ai_director_video_discover (
    work_id CHAR(36) NOT NULL,
    share_token VARCHAR(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    listed_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    PRIMARY KEY (work_id),
    KEY idx_ai_film_discover_listed (listed_at, work_id),
    CONSTRAINT fk_ai_film_discover_share FOREIGN KEY (work_id)
      REFERENCES ai_director_video_share(work_id) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
