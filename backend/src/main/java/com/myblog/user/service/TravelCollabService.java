package com.myblog.user.service;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.myblog.user.entity.TravelProject;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.mapper.TravelProjectMapper;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Objects;

@Service
public class TravelCollabService {
    private final JdbcTemplate jdbc;
    private final TravelProjectMapper travels;
    private final ObjectMapper mapper;
    private final JourneyAccessService access;
    private final JourneyGroupService groups;
    private final SocialHubService hub; // TRAVEL_SOCIAL_V12

    public TravelCollabService(JdbcTemplate jdbc, TravelProjectMapper travels, ObjectMapper mapper, SocialHubService hub, JourneyAccessService access, JourneyGroupService groups) {
        this.hub = hub;this.access=access;this.groups=groups;
        this.jdbc = jdbc;
        this.travels = travels;
        this.mapper = mapper;
    }

    private TravelProject travel(Long travelId) {
        TravelProject t = travelId == null ? null : travels.selectById(travelId);
        if (t == null) throw new BusinessException(404, "旅程不存在");
        return t;
    }
    private TravelProject owner(Long userId, Long travelId) {
        TravelProject t = travel(travelId);
        if (!Objects.equals(t.getUserId(), userId)) throw new BusinessException(403, "仅旅程创建者可操作");
        return t;
    }
    private boolean isMember(long travelId, long userId) {
        Integer count = jdbc.queryForObject("SELECT COUNT(*) FROM travel_collab_member WHERE travel_id=? AND user_id=? AND status='ACTIVE'", Integer.class, travelId, userId);
        return count != null && count > 0;
    }
    private List<Map<String,Object>> members(TravelProject travel) {
        List<Map<String,Object>> result = new ArrayList<>();
        // Never return the user's password field.
        result.addAll(jdbc.queryForList("SELECT id AS userId, username, nickname, avatar, 'OWNER' AS role FROM user WHERE id=?", travel.getUserId()));
        result.addAll(jdbc.queryForList("SELECT u.id AS userId,u.username,u.nickname,u.avatar,'COLLABORATOR' AS role " +
                "FROM travel_collab_member m JOIN user u ON u.id=m.user_id " +
                "WHERE m.travel_id=? AND m.status='ACTIVE' AND u.status=1 ORDER BY m.joined_at ASC", travel.getId()));
        return result;
    }
    private Map<String,Object> card(TravelProject travel, long viewer) {
        Map<String,Object> result = mapper.convertValue(travel, new TypeReference<LinkedHashMap<String,Object>>() {});
        List<Map<String,Object>> participants = members(travel);
        result.put("myRole", Objects.equals(travel.getUserId(), viewer) ? "OWNER" : "COLLABORATOR");
        result.put("members", participants);
        result.put("memberCount", participants.size());
        result.put("collabEnabled",JourneyAccessService.flag(access.policy(travel.getId()),"enabled"));
        return result;
    }
    public List<Map<String,Object>> myTravels(Long viewer) {
        if (viewer == null) throw new BusinessException(401, "请先登录");
        List<TravelProject> owned = travels.selectList(new LambdaQueryWrapper<TravelProject>()
                .eq(TravelProject::getUserId, viewer).orderByDesc(TravelProject::getCreatedAt));
        List<Long> joinedIds = jdbc.queryForList("SELECT m.travel_id FROM travel_collab_member m " +
                "JOIN travel_project t ON t.id=m.travel_id WHERE m.user_id=? AND m.status='ACTIVE' AND t.user_id<>?", Long.class, viewer, viewer);
        List<Map<String,Object>> result = new ArrayList<>();
        for (TravelProject travel : owned) result.add(card(travel, viewer));
        for (Long id : joinedIds) {
            TravelProject travel = travels.selectById(id);
            if (travel != null) result.add(card(travel, viewer));
        }
        return result;
    }
    public Map<String,Object> preview(Long viewer, Long travelId) {
        TravelProject travel = travel(travelId);
        if (!Objects.equals(travel.getUserId(), viewer) && !isMember(travelId, viewer)) {
            throw new BusinessException(403, "你还不是这段旅程的成员");
        }
        return card(travel, viewer);
    }
    public List<Map<String,Object>> inbox(Long viewer) {
        return jdbc.queryForList("SELECT i.id, i.travel_id AS travelId, i.status, i.created_at AS createdAt, " +
                "t.title AS travelTitle, u.nickname AS inviterNickname, u.username AS inviterUsername " +
                "FROM travel_collab_invite i JOIN travel_project t ON t.id=i.travel_id " +
                "JOIN user u ON u.id=i.inviter_id WHERE i.invitee_id=? ORDER BY i.created_at DESC LIMIT 100", viewer);
    }
    public List<Map<String,Object>> sentInvites(Long viewer, Long travelId) {
        owner(viewer, travelId);
        return jdbc.queryForList("SELECT i.id,i.status,i.created_at AS createdAt, " +
                "u.id AS userId,u.username,u.nickname,u.avatar FROM travel_collab_invite i " +
                "JOIN user u ON u.id=i.invitee_id WHERE i.travel_id=? ORDER BY i.created_at DESC LIMIT 100", travelId);
    }
    @Transactional
    public void invite(Long inviter, Long travelId, String rawUsername) {
        access.requireOwner(inviter,travelId,true);access.requireEnabled(travelId);
        TravelProject t = owner(inviter, travelId);
        String username = rawUsername == null ? "" : rawUsername.trim();
        if (username.length() < 2 || username.length() > 50) throw new BusinessException("请填写有效的同行者用户名");
        List<Long> ids = jdbc.queryForList("SELECT id FROM user WHERE username=? AND status=1 LIMIT 1", Long.class, username);
        if (ids.isEmpty()) throw new BusinessException(404, "未找到该用户名，请核对后重试");
        Long invitee = ids.get(0);
        if (invitee.equals(t.getUserId())) throw new BusinessException("不能邀请旅程创建者本人");
        if (isMember(travelId, invitee)) throw new BusinessException("对方已经是同行者");
        List<Map<String,Object>> past = jdbc.queryForList("SELECT status FROM travel_collab_invite WHERE travel_id=? AND invitee_id=?", travelId, invitee);
        if (!past.isEmpty() && "PENDING".equals(past.get(0).get("status"))) throw new BusinessException("邀请已发送，等待对方确认");
        jdbc.update("INSERT INTO travel_collab_invite (travel_id,inviter_id,invitee_id,status) VALUES (?,?,?,'PENDING') " +
                "ON DUPLICATE KEY UPDATE inviter_id=VALUES(inviter_id),status='PENDING',created_at=NOW(),responded_at=NULL", travelId, inviter, invitee);
        hub.notifyEvent(invitee, inviter, "TRAVEL_INVITE", null, travelId, "邀请你参加旅行共创");
    }
    @Transactional
    public void decide(Long viewer, Long inviteId, String decision) {
        if (!"ACCEPTED".equals(decision) && !"REJECTED".equals(decision)) throw new BusinessException("无效邀请操作");
        List<Map<String,Object>> rows = jdbc.queryForList("SELECT travel_id AS travelId,inviter_id AS inviterId,invitee_id AS inviteeId,status FROM travel_collab_invite WHERE id=?", inviteId);
        if (rows.isEmpty()) throw new BusinessException(404, "邀请不存在");
        Map<String,Object> row = rows.get(0);
        long invitee = ((Number)row.get("inviteeId")).longValue();
        long travelId = ((Number)row.get("travelId")).longValue();
        if (viewer != invitee) throw new BusinessException(403, "只能处理发给自己的邀请");
        access.owner(travelId,true);
        rows = jdbc.queryForList("SELECT status FROM travel_collab_invite WHERE id=? FOR UPDATE", inviteId);
        row.put("status",rows.get(0).get("status"));
        if ("ACCEPTED".equals(decision))access.requireEnabled(travelId);
        if (!"PENDING".equals(row.get("status"))) throw new BusinessException("这条邀请已经处理过");
        TravelProject t = travel(travelId);
        if (!Objects.equals(t.getUserId(), ((Number)row.get("inviterId")).longValue())) throw new BusinessException("原邀请者不再是旅程创建者");
        int updated = jdbc.update("UPDATE travel_collab_invite SET status=?,responded_at=NOW() WHERE id=? AND status='PENDING'", decision, inviteId);
        if (updated != 1) throw new BusinessException("邀请状态已变化，请刷新");
        hub.notifyEvent(((Number)row.get("inviterId")).longValue(), viewer, "ACCEPTED".equals(decision) ? "TRAVEL_ACCEPTED" : "TRAVEL_REJECTED", inviteId, travelId, "ACCEPTED".equals(decision) ? "接受了同行邀请" : "拒绝了同行邀请");
        if ("ACCEPTED".equals(decision)) {
            jdbc.update("INSERT INTO travel_collab_member (travel_id,user_id,status) VALUES (?,?,'ACTIVE') " +
                    "ON DUPLICATE KEY UPDATE status='ACTIVE',joined_at=NOW()", travelId, viewer);
        }
    }
    @Transactional
    public void cancel(Long userId, Long inviteId) {
        int count = jdbc.update("UPDATE travel_collab_invite i JOIN travel_project t ON t.id=i.travel_id " +
                "SET i.status='CANCELED',i.responded_at=NOW() WHERE i.id=? AND t.user_id=? AND i.status='PENDING'", inviteId, userId);
        if (count != 1) throw new BusinessException("邀请不存在、无权限或已处理");
        var canceledRows = jdbc.queryForList("SELECT invitee_id,travel_id FROM travel_collab_invite WHERE id=?", inviteId);
        if (!canceledRows.isEmpty()) hub.notifyEvent(((Number)canceledRows.get(0).get("invitee_id")).longValue(), userId, "TRAVEL_CANCELED", inviteId,
                ((Number)canceledRows.get(0).get("travel_id")).longValue(), "撤回了同行邀请");
    }
    @Transactional
    public void removeMember(Long userId, Long travelId, Long memberId) {
        access.requireOwner(userId,travelId,true);
        TravelProject t = owner(userId, travelId);
        if (Objects.equals(t.getUserId(), memberId)) throw new BusinessException("不能移除创建者");
        int removed = jdbc.update("UPDATE travel_collab_member SET status='REMOVED' WHERE travel_id=? AND user_id=? AND status='ACTIVE'", travelId, memberId);
        groups.revoke(memberId,travelId);
        if (removed > 0) hub.notifyEvent(memberId, userId, "TRAVEL_MEMBER_REMOVED", null, travelId, "将你移出了共创旅行");
        jdbc.update("UPDATE travel_collab_invite SET status='CANCELED' WHERE travel_id=? AND invitee_id=? AND status='ACCEPTED'", travelId, memberId);
    }
    @Transactional
    public void leave(Long viewer, Long travelId) {
        access.requireMember(viewer,travelId,true);
        TravelProject t = travel(travelId);
        if (Objects.equals(t.getUserId(), viewer)) throw new BusinessException("创建者不能退出自己创建的旅程");
        int updated = jdbc.update("UPDATE travel_collab_member SET status='REMOVED' WHERE travel_id=? AND user_id=? AND status='ACTIVE'", travelId, viewer);
        groups.revoke(viewer,travelId);
        if (updated < 1) throw new BusinessException("你不是这段旅程的同行者");
        hub.notifyEvent(t.getUserId(), viewer, "TRAVEL_MEMBER_LEFT", null, travelId, "退出了共创旅行");
        jdbc.update("UPDATE travel_collab_invite SET status='CANCELED' WHERE travel_id=? AND invitee_id=? AND status='ACCEPTED'", travelId, viewer);
    }
}
