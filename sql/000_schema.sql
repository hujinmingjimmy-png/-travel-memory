-- Travel Memory schema for a new, empty MySQL 8 database.
-- Run with the destination database selected. Contains table definitions only.
SET NAMES utf8mb4;
SET @tm_old_foreign_key_checks = @@FOREIGN_KEY_CHECKS;
SET FOREIGN_KEY_CHECKS = 0;

CREATE TABLE IF NOT EXISTS `ai_director_draft` (
  `travel_id` bigint NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `revision` int NOT NULL DEFAULT '1',
  `draft_json` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`travel_id`),
  KEY `idx_ai_director_owner` (`owner_user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ai_director_video_discover` (
  `work_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `share_token` varchar(43) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `listed_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`work_id`),
  KEY `idx_ai_film_discover_listed` (`listed_at`,`work_id`),
  CONSTRAINT `fk_ai_film_discover_share` FOREIGN KEY (`work_id`) REFERENCES `ai_director_video_share` (`work_id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ai_director_video_share` (
  `work_id` char(36) CHARACTER SET utf8mb4 COLLATE utf8mb4_0900_ai_ci NOT NULL,
  `share_token` varchar(43) CHARACTER SET ascii COLLATE ascii_bin DEFAULT NULL,
  `is_public` tinyint(1) NOT NULL DEFAULT '0',
  `published_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`work_id`),
  UNIQUE KEY `uq_ai_director_share_token` (`share_token`),
  CONSTRAINT `fk_ai_director_share_work` FOREIGN KEY (`work_id`) REFERENCES `ai_director_video_work` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `ai_director_video_work` (
  `id` char(36) NOT NULL,
  `owner_user_id` bigint NOT NULL,
  `travel_id` bigint NOT NULL,
  `source_job_id` char(36) NOT NULL,
  `title` varchar(100) NOT NULL,
  `file_bytes` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_director_video_job` (`owner_user_id`,`travel_id`,`source_job_id`),
  KEY `idx_director_video_owner_travel_time` (`owner_user_id`,`travel_id`,`created_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_auto_friendship` (
  `user_low` bigint NOT NULL,
  `user_high` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_low`,`user_high`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_chat_conversation` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_low` bigint NOT NULL,
  `user_high` bigint NOT NULL,
  `last_read_low` bigint NOT NULL DEFAULT '0',
  `last_read_high` bigint NOT NULL DEFAULT '0',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tm_chat_pair` (`user_low`,`user_high`),
  KEY `idx_tm_conv_high` (`user_high`,`updated_at`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_chat_message` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `conversation_id` bigint NOT NULL,
  `sender_id` bigint NOT NULL,
  `body` varchar(2000) NOT NULL,
  `client_id` varchar(64) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tm_msg_dedupe` (`conversation_id`,`sender_id`,`client_id`),
  KEY `idx_tm_msg_history` (`conversation_id`,`id`),
  KEY `idx_tm_msg_sender_time` (`sender_id`,`created_at`),
  CONSTRAINT `fk_tm_msg_conv` FOREIGN KEY (`conversation_id`) REFERENCES `tm_chat_conversation` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_chat_message_extra` (
  `message_id` bigint NOT NULL,
  `kind` varchar(10) NOT NULL DEFAULT 'TEXT',
  `file_name` varchar(128) DEFAULT NULL,
  `mime_type` varchar(50) DEFAULT NULL,
  `reply_to_id` bigint DEFAULT NULL,
  `revoked_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`message_id`),
  KEY `idx_chat_extra_reply` (`reply_to_id`),
  CONSTRAINT `fk_chat_extra_message` FOREIGN KEY (`message_id`) REFERENCES `tm_chat_message` (`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_friend_request` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `user_low` bigint NOT NULL,
  `user_high` bigint NOT NULL,
  `requester_id` bigint NOT NULL,
  `receiver_id` bigint NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'PENDING',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tm_friend_pair` (`user_low`,`user_high`),
  KEY `idx_tm_fr_receiver` (`receiver_id`,`status`,`created_at`),
  KEY `idx_tm_fr_requester` (`requester_id`,`status`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_friendship` (
  `user_low` bigint NOT NULL,
  `user_high` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`user_low`,`user_high`),
  KEY `idx_tm_friend_high` (`user_high`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_journey_contribution` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `travel_id` bigint NOT NULL,
  `author_id` bigint NOT NULL,
  `kind` varchar(12) NOT NULL,
  `title` varchar(100) NOT NULL DEFAULT '',
  `body` varchar(1500) NOT NULL DEFAULT '',
  `file_key` varchar(80) DEFAULT NULL,
  `mime_type` varchar(32) DEFAULT NULL,
  `file_bytes` bigint DEFAULT NULL,
  `status` varchar(12) NOT NULL DEFAULT 'PENDING',
  `reviewed_by` bigint DEFAULT NULL,
  `reviewed_at` datetime(3) DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `source_media_id` bigint unsigned DEFAULT NULL,
  `client_id` varchar(64) DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tm_post_client` (`travel_id`,`author_id`,`client_id`),
  UNIQUE KEY `uq_tm_post_source` (`travel_id`,`source_media_id`),
  KEY `idx_tm_journey_feed` (`travel_id`,`status`,`id`),
  KEY `idx_tm_journey_author` (`author_id`,`travel_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_journey_group_member` (
  `travel_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `status` varchar(16) NOT NULL,
  `inviter_id` bigint DEFAULT NULL,
  `invite_version` bigint NOT NULL DEFAULT '0',
  `invited_at` datetime(3) DEFAULT NULL,
  `responded_at` datetime(3) DEFAULT NULL,
  `joined_at` datetime(3) DEFAULT NULL,
  PRIMARY KEY (`travel_id`,`user_id`),
  KEY `idx_tm_group_user` (`user_id`,`status`,`travel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_journey_group_message` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `travel_id` bigint NOT NULL,
  `sender_id` bigint NOT NULL,
  `body` varchar(1000) NOT NULL,
  `client_id` varchar(64) NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_tm_journey_msg` (`travel_id`,`sender_id`,`client_id`),
  KEY `idx_tm_journey_msg_history` (`travel_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_journey_group_read` (
  `travel_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `last_read_id` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`travel_id`,`user_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_journey_policy` (
  `travel_id` bigint NOT NULL,
  `members_can_submit` tinyint(1) NOT NULL DEFAULT '1',
  `review_required` tinyint(1) NOT NULL DEFAULT '1',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `collab_enabled` tinyint(1) NOT NULL DEFAULT '0',
  `version` bigint NOT NULL DEFAULT '0',
  PRIMARY KEY (`travel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `tm_social_notification` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `recipient_id` bigint NOT NULL,
  `actor_id` bigint NOT NULL,
  `event_type` varchar(40) NOT NULL,
  `reference_id` bigint DEFAULT NULL,
  `travel_id` bigint DEFAULT NULL,
  `title` varchar(180) NOT NULL,
  `is_read` tinyint NOT NULL DEFAULT '0',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_tm_notif_receiver` (`recipient_id`,`is_read`,`id`),
  KEY `idx_tm_notif_actor` (`actor_id`,`id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `travel_collab_invite` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `travel_id` bigint NOT NULL,
  `inviter_id` bigint NOT NULL,
  `invitee_id` bigint NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'PENDING',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  `responded_at` datetime DEFAULT NULL,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uq_travel_invitee` (`travel_id`,`invitee_id`),
  KEY `idx_invitee_status` (`invitee_id`,`status`,`created_at`),
  KEY `idx_inviter` (`inviter_id`,`travel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `travel_collab_member` (
  `travel_id` bigint NOT NULL,
  `user_id` bigint NOT NULL,
  `status` varchar(16) NOT NULL DEFAULT 'ACTIVE',
  `joined_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  PRIMARY KEY (`travel_id`,`user_id`),
  KEY `idx_member_user` (`user_id`,`status`,`travel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `travel_comment` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `travel_id` bigint unsigned NOT NULL,
  `user_id` bigint NOT NULL,
  `content` varchar(1000) COLLATE utf8mb4_unicode_ci NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_comment_travel` (`travel_id`,`id`),
  KEY `idx_comment_user_time` (`user_id`,`created_at`),
  CONSTRAINT `fk_comment_travel` FOREIGN KEY (`travel_id`) REFERENCES `travel_project` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_comment_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `travel_like` (
  `travel_id` bigint unsigned NOT NULL,
  `user_id` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`travel_id`,`user_id`),
  KEY `idx_like_user` (`user_id`,`created_at`),
  CONSTRAINT `fk_like_travel` FOREIGN KEY (`travel_id`) REFERENCES `travel_project` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_like_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `travel_map_scene` (
  `travel_id` bigint NOT NULL,
  `source_type` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'IMAGE',
  `center_lng` double DEFAULT NULL,
  `center_lat` double DEFAULT NULL,
  `zoom_level` double NOT NULL DEFAULT '11',
  `pitch` double NOT NULL DEFAULT '55',
  `rotation` double NOT NULL DEFAULT '0',
  `cartoon_style` varchar(24) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'SAKURA',
  `south_west_lng` double DEFAULT NULL,
  `south_west_lat` double DEFAULT NULL,
  `north_east_lng` double DEFAULT NULL,
  `north_east_lat` double DEFAULT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`travel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `travel_media` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '照片ID',
  `travel_id` bigint unsigned NOT NULL COMMENT '所属旅行ID',
  `file_name` varchar(180) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '服务器生成的安全文件名',
  `original_name` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '上传时的原文件名，仅供展示',
  `mime_type` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '经文件内容确认的媒体类型',
  `file_size` bigint NOT NULL COMMENT '文件字节数',
  `caption` varchar(255) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '照片说明',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '顺序',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  KEY `idx_travel_media_travel_order` (`travel_id`,`sort_order`,`id`),
  CONSTRAINT `fk_travel_media_travel` FOREIGN KEY (`travel_id`) REFERENCES `travel_project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='一次旅行对应多张照片；图片磁盘文件由后端鉴权后读取';

CREATE TABLE IF NOT EXISTS `travel_playback` (
  `travel_id` bigint unsigned NOT NULL,
  `transition` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'fade',
  `music_url` varchar(500) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT '',
  `volume` decimal(4,3) NOT NULL DEFAULT '0.350',
  `map_enabled` tinyint NOT NULL DEFAULT '1',
  `full_on_start` tinyint NOT NULL DEFAULT '1',
  PRIMARY KEY (`travel_id`),
  CONSTRAINT `fk_playback_travel` FOREIGN KEY (`travel_id`) REFERENCES `travel_project` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_playback_volume` CHECK (((`volume` >= 0) and (`volume` <= 1)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS `travel_point` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT,
  `travel_id` bigint unsigned NOT NULL,
  `media_id` bigint unsigned DEFAULT NULL COMMENT '关联这段旅行中上传的照片（可为空）',
  `title` varchar(80) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '记忆点标题',
  `subtitle` varchar(150) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '一句话副标题',
  `content` text COLLATE utf8mb4_unicode_ci COMMENT '记忆故事正文',
  `location_name` varchar(120) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '地点名称',
  `travel_date` date DEFAULT NULL COMMENT '记忆发生日期',
  `x_ratio` decimal(9,6) NOT NULL DEFAULT '0.500000' COMMENT '水平坐标 0-1',
  `y_ratio` decimal(9,6) NOT NULL DEFAULT '0.500000' COMMENT '垂直坐标 0-1',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '故事顺序；之后供故事/沉浸播放复用',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  `point_type` varchar(16) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'CUSTOM' COMMENT 'CUSTOM手账，REAL真实地图',
  `longitude` decimal(10,7) DEFAULT NULL COMMENT '高德GCJ-02经度',
  `latitude` decimal(10,7) DEFAULT NULL COMMENT '高德GCJ-02纬度',
  PRIMARY KEY (`id`),
  KEY `idx_travel_point_order` (`travel_id`,`sort_order`,`id`),
  KEY `fk_travel_point_media` (`media_id`),
  CONSTRAINT `fk_travel_point_media` FOREIGN KEY (`media_id`) REFERENCES `travel_media` (`id`) ON DELETE SET NULL ON UPDATE CASCADE,
  CONSTRAINT `fk_travel_point_travel` FOREIGN KEY (`travel_id`) REFERENCES `travel_project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `chk_travel_point_x` CHECK (((`x_ratio` >= 0) and (`x_ratio` <= 1))),
  CONSTRAINT `chk_travel_point_y` CHECK (((`y_ratio` >= 0) and (`y_ratio` <= 1)))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='旅行地图空间记忆点';

CREATE TABLE IF NOT EXISTS `travel_project` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '旅行项目ID',
  `user_id` bigint NOT NULL COMMENT '创建者用户ID',
  `title` varchar(100) COLLATE utf8mb4_unicode_ci NOT NULL COMMENT '旅行标题',
  `subtitle` varchar(200) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '旅行副标题',
  `description` text COLLATE utf8mb4_unicode_ci COMMENT '旅行简介',
  `cover_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '旅行封面图片地址',
  `background_url` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL COMMENT '旅行背景图片地址',
  `start_date` date DEFAULT NULL COMMENT '旅行开始日期',
  `end_date` date DEFAULT NULL COMMENT '旅行结束日期',
  `visibility` varchar(20) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'PRIVATE' COMMENT '可见性：PRIVATE/PUBLIC',
  `is_published` tinyint NOT NULL DEFAULT '0' COMMENT '是否发布：0草稿 1已发布',
  `view_count` bigint unsigned NOT NULL DEFAULT '0' COMMENT '浏览次数',
  `like_count` bigint unsigned NOT NULL DEFAULT '0' COMMENT '点赞次数',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) COMMENT '创建时间',
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3) COMMENT '更新时间',
  `cover_media_id` bigint unsigned DEFAULT NULL COMMENT '主题主封面照片ID',
  `background_media_id` bigint unsigned DEFAULT NULL COMMENT '主题背景画面照片ID',
  `map_background_media_id` bigint unsigned DEFAULT NULL COMMENT '地图模式专用背景照片ID',
  PRIMARY KEY (`id`),
  KEY `idx_travel_project_user_id` (`user_id`),
  KEY `idx_travel_project_public` (`visibility`,`is_published`),
  KEY `idx_travel_cover_media` (`cover_media_id`),
  KEY `idx_travel_bg_media` (`background_media_id`),
  KEY `idx_discover_feed` (`visibility`,`is_published`,`created_at`,`id`),
  CONSTRAINT `fk_travel_project_user` FOREIGN KEY (`user_id`) REFERENCES `user` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='旅行项目主表';

CREATE TABLE IF NOT EXISTS `travel_route_snapshot` (
  `travel_id` bigint NOT NULL,
  `revision` bigint NOT NULL,
  `point_signature` char(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
  `route_json` json NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`travel_id`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_0900_ai_ci;

CREATE TABLE IF NOT EXISTS `travel_scene` (
  `id` bigint unsigned NOT NULL AUTO_INCREMENT COMMENT '播放场景ID',
  `travel_id` bigint unsigned NOT NULL COMMENT '所属旅行ID',
  `point_id` bigint unsigned NOT NULL COMMENT '对应 travel_point 记忆点',
  `sort_order` int NOT NULL DEFAULT '0' COMMENT '沉浸播放顺序',
  `camera_scale` decimal(4,2) NOT NULL DEFAULT '1.12' COMMENT '照片镜头最终放大倍率',
  `move_duration` int NOT NULL DEFAULT '900' COMMENT '进入场景镜头移动时间，毫秒',
  `stay_duration` int NOT NULL DEFAULT '3800' COMMENT '场景停留时间，毫秒',
  `easing` varchar(32) COLLATE utf8mb4_unicode_ci NOT NULL DEFAULT 'ease-in-out' COMMENT '转场缓动：ease-in-out/ease-out/linear',
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  `updated_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_travel_scene_point` (`travel_id`,`point_id`),
  KEY `idx_travel_scene_order` (`travel_id`,`sort_order`,`id`),
  KEY `fk_travel_scene_point` (`point_id`),
  CONSTRAINT `fk_travel_scene_point` FOREIGN KEY (`point_id`) REFERENCES `travel_point` (`id`) ON DELETE CASCADE ON UPDATE CASCADE,
  CONSTRAINT `fk_travel_scene_travel` FOREIGN KEY (`travel_id`) REFERENCES `travel_project` (`id`) ON DELETE CASCADE ON UPDATE CASCADE
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='旅行沉浸播放场景参数';

CREATE TABLE IF NOT EXISTS `user` (
  `id` bigint NOT NULL AUTO_INCREMENT,
  `username` varchar(50) COLLATE utf8mb4_unicode_ci NOT NULL,
  `password` varchar(255) COLLATE utf8mb4_unicode_ci NOT NULL,
  `nickname` varchar(50) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `avatar` varchar(500) COLLATE utf8mb4_unicode_ci DEFAULT NULL,
  `status` tinyint NOT NULL DEFAULT '1',
  `created_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP,
  `updated_at` datetime NOT NULL DEFAULT CURRENT_TIMESTAMP ON UPDATE CURRENT_TIMESTAMP,
  PRIMARY KEY (`id`),
  UNIQUE KEY `uk_username` (`username`)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci COMMENT='用户表';

CREATE TABLE IF NOT EXISTS `user_follow` (
  `follower_id` bigint NOT NULL,
  `followed_id` bigint NOT NULL,
  `created_at` datetime(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
  PRIMARY KEY (`follower_id`,`followed_id`),
  KEY `idx_follow_author` (`followed_id`),
  CONSTRAINT `fk_follow_from` FOREIGN KEY (`follower_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `fk_follow_to` FOREIGN KEY (`followed_id`) REFERENCES `user` (`id`) ON DELETE CASCADE,
  CONSTRAINT `chk_follow_self` CHECK ((`follower_id` <> `followed_id`))
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4 COLLATE=utf8mb4_unicode_ci;

CREATE TABLE IF NOT EXISTS tm_user_appearance (
  user_id BIGINT NOT NULL PRIMARY KEY,
  overlay_percent TINYINT UNSIGNED NOT NULL DEFAULT 15,
  position_x TINYINT UNSIGNED NOT NULL DEFAULT 50,
  position_y TINYINT UNSIGNED NOT NULL DEFAULT 50,
  image_name VARCHAR(64) NULL,
  updated_at TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;

SET FOREIGN_KEY_CHECKS = @tm_old_foreign_key_checks;
