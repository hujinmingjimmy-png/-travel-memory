-- Travel Memory route snapshot v1, MySQL 8.0+, add-only migration.
-- Run only after reviewing the active database/schema and taking a backup.
-- CREATE IF NOT EXISTS does not overwrite an existing table.
CREATE TABLE IF NOT EXISTS travel_route_snapshot (
    travel_id BIGINT NOT NULL,
    revision BIGINT NOT NULL,
    point_signature CHAR(64) CHARACTER SET ascii COLLATE ascii_bin NOT NULL,
    route_json JSON NOT NULL,
    created_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3),
    updated_at DATETIME(3) NOT NULL DEFAULT CURRENT_TIMESTAMP(3) ON UPDATE CURRENT_TIMESTAMP(3),
    PRIMARY KEY (travel_id)
) ENGINE=InnoDB DEFAULT CHARSET=utf8mb4;
-- Deliberately no automatic DELETE/UPDATE against existing travel_project or travel_point data.
-- Optional FK/cascade requires checking the actual travel_project.id column type first.
