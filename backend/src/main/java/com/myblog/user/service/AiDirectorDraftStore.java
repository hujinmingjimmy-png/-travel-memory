package com.myblog.user.service;

import com.fasterxml.jackson.core.JsonProcessingException;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.vo.RealMapPointVO;
import com.myblog.user.vo.TravelMediaVO;
import com.myblog.user.vo.TravelProjectVO;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;

import java.sql.Timestamp;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

/**
 * AI Director v2: one saved storyboard per travel. Uses optimistic revision control.
 * No auto-publishing; no media bytes are copied into the database.
 */
@Service
public class AiDirectorDraftStore {
    private final JdbcTemplate jdbc;
    private final TravelProjectService travels;
    private final TravelRealMapService realMap;
    private final TravelMediaService media;
    private final ObjectMapper mapper;

    public AiDirectorDraftStore(JdbcTemplate jdbc, TravelProjectService travels,
                                TravelRealMapService realMap, TravelMediaService media,
                                ObjectMapper mapper) {
        this.jdbc = jdbc;
        this.travels = travels;
        this.realMap = realMap;
        this.media = media;
        this.mapper = mapper;
    }

    public record CloudDraft(int revision, String updatedAt, AiDirectorService.StoryboardDraft draft) {}

    private void requireOwner(Long userId, Long travelId) {
        if (userId == null || userId <= 0 || travelId == null || travelId <= 0) {
            throw new BusinessException(400, "旅行参数无效");
        }
        TravelProjectVO project = travels.getTravelDetail(userId, travelId);
        if (project == null || !userId.equals(project.getUserId())) {
            throw new BusinessException(403, "只有旅行创建者可以管理导演草稿");
        }
    }

    /** No saved row is represented as null. */
    public CloudDraft load(Long userId, Long travelId) {
        requireOwner(userId, travelId);
        List<CloudDraft> rows = jdbc.query(
            "SELECT revision, draft_json, updated_at FROM ai_director_draft " +
            "WHERE travel_id = ? AND owner_user_id = ?",
            (rs, index) -> {
                try {
                    AiDirectorService.StoryboardDraft draft = mapper.readValue(
                        rs.getString("draft_json"), AiDirectorService.StoryboardDraft.class);
                    Timestamp time = rs.getTimestamp("updated_at");
                    return new CloudDraft(rs.getInt("revision"),
                        time == null ? "" : time.toLocalDateTime().toString(), draft);
                } catch (JsonProcessingException e) {
                    throw new IllegalStateException("Stored storyboard is invalid", e);
                }
            }, travelId, userId);
        return rows.isEmpty() ? null : rows.get(0);
    }

    /** Creates at revision 0, then uses atomic CAS updates for subsequent saves. */
    public CloudDraft save(Long userId, Long travelId, Integer expectedRevision,
                           AiDirectorService.StoryboardDraft draft) {
        requireOwner(userId, travelId);
        if (expectedRevision == null || expectedRevision < 0 || expectedRevision > 100000000) {
            throw new BusinessException(400, "分镜版本号无效");
        }
        validate(userId, travelId, draft);
        String json;
        try {
            json = mapper.writeValueAsString(draft);
        } catch (JsonProcessingException e) {
            throw new BusinessException(400, "分镜数据无法保存");
        }
        if (json.length() > 100000) throw new BusinessException(400, "分镜数据过大");

        if (expectedRevision == 0) {
            // UNIQUE(travel_id) prevents two concurrent first saves; the existing
            // DuplicateKeyException handler returns HTTP 409 to the other writer.
            jdbc.update("INSERT INTO ai_director_draft " +
                "(travel_id, owner_user_id, revision, draft_json) VALUES (?, ?, 1, ?)",
                travelId, userId, json);
        } else {
            int rows = jdbc.update("UPDATE ai_director_draft SET " +
                "draft_json = ?, revision = revision + 1, updated_at = CURRENT_TIMESTAMP(3) " +
                "WHERE travel_id = ? AND owner_user_id = ? AND revision = ?",
                json, travelId, userId, expectedRevision);
            if (rows != 1) {
                throw new BusinessException(409, "云端草稿已被其他页面修改，请刷新或重新载入后处理");
            }
        }
        return load(userId, travelId);
    }

    /** Preserve the fixed 30s/16:9 contract and ensure referenced assets belong to this trip. */
    private void validate(Long userId, Long travelId, AiDirectorService.StoryboardDraft draft) {
        if (draft == null || draft.title() == null || draft.title().isBlank()
            || draft.title().length() > 100 || !"CINEMATIC".equals(draft.style())
            || !"16:9".equals(draft.aspectRatio()) || draft.durationMs() != 30000
            || draft.shots() == null || draft.shots().size() != 6) {
            throw new BusinessException(400, "只允许保存 30 秒 16:9 的六镜头电影分镜");
        }
        if (draft.mode() == null || !Set.of("RULES", "AI_TEXT", "RULES_FALLBACK").contains(draft.mode())
            || draft.notice() == null || draft.notice().length() > 500) {
            throw new BusinessException(400, "分镜模式或说明不正确");
        }
        Set<Long> points = new HashSet<>();
        for (RealMapPointVO point : realMap.list(travelId, userId)) points.add(point.getId());
        Set<Long> images = new HashSet<>();
        for (TravelMediaVO item : media.list(userId, travelId)) {
            if (item.getMimeType() != null && item.getMimeType().startsWith("image/")) images.add(item.getId());
        }
        String[] expectedTypes = {"OPENING", "LOCATION", "PHOTO", "MEMORY", "MONTAGE", "CLOSING"};
        Set<String> allowedMotion = Set.of("SLOW_ZOOM_IN", "SLOW_ZOOM_OUT", "STILL", "PAN_LEFT", "PAN_RIGHT", "CROSSFADE");
        int offset = 0;
        for (int i = 0; i < 6; i++) {
            AiDirectorService.Shot shot = draft.shots().get(i);
            if (shot == null || shot.order() != i + 1 || !expectedTypes[i].equals(shot.type())
                || shot.startMs() != offset || shot.durationMs() < 1500 || shot.durationMs() > 10000
                || shot.durationMs() % 100 != 0 || shot.motion() == null || !allowedMotion.contains(shot.motion())
                || shot.caption() == null || shot.caption().length() > 120
                || (shot.pointId() != null && !points.contains(shot.pointId()))
                || (shot.mediaId() != null && !images.contains(shot.mediaId()))) {
                throw new BusinessException(400, "镜头 " + (i + 1) + " 的参数或素材引用无效");
            }
            offset += shot.durationMs();
        }
        if (offset != 30000) throw new BusinessException(400, "镜头总时长必须正好为 30 秒");
    }
}
