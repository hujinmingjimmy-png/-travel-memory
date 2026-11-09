package com.myblog.user.service;

import com.myblog.user.exception.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
public class JourneyGroupService {
    private final JdbcTemplate db;
    private final JourneyAccessService access;
    private final SocialHubService social;
    private final SocialHubPush push;
    public JourneyGroupService(JdbcTemplate db,JourneyAccessService access,SocialHubService social,SocialHubPush push) {
        this.db=db;this.access=access;this.social=social;this.push=push;
    }
    public String state(long me,long trip) {
        var rows=db.queryForList("SELECT status FROM tm_journey_group_member WHERE travel_id=? AND user_id=?",String.class,trip,me);
        return rows.isEmpty()?"NONE":rows.get(0);
    }
    public void requireActive(long me,long trip,boolean lock) {
        access.requireMember(me,trip,lock);
        if(!"ACTIVE".equals(state(me,trip)))throw new BusinessException(403,"请先接受群聊邀请；退出或被移除后无法访问");
    }
    public List<Map<String,Object>> members(long me,long trip) {
        access.requireOwner(me,trip,false);
        return db.queryForList("SELECT m.user_id AS userId,m.status,m.invite_version AS inviteVersion,u.nickname,u.username,u.avatar FROM tm_journey_group_member m JOIN user u ON u.id=m.user_id WHERE m.travel_id=?",trip);
    }
    private void activateOwner(long me,long trip) {
        db.update("INSERT INTO tm_journey_group_member(travel_id,user_id,status,joined_at) VALUES (?,?,'ACTIVE',NOW(3)) ON DUPLICATE KEY UPDATE status='ACTIVE',joined_at=NOW(3)",trip,me);
    }
    @Transactional public void joinOwner(long me,long trip) {
        access.requireOwner(me,trip,true);access.requireEnabled(trip);activateOwner(me,trip);push.hint(me);
    }
    @Transactional public void invite(long me,long trip,long other) {
        access.requireOwner(me,trip,true); access.requireEnabled(trip);
        if(other==me)throw new BusinessException("请选择已加入旅行的同行者");
        access.requireMember(other,trip,false);
        if(access.count("SELECT COUNT(*) FROM user WHERE id=? AND status=1",other)!=1)throw new BusinessException(404,"用户不可用");
        String state=state(other,trip);
        if("ACTIVE".equals(state)||"INVITED".equals(state))return;
        // Explicitly inviting starts/rejoins the creator's conversation, never auto-joins the invitee.
        activateOwner(me,trip);
        db.update("INSERT INTO tm_journey_group_member(travel_id,user_id,status,inviter_id,invite_version,invited_at) VALUES (?,?,'INVITED',?,1,NOW(3)) ON DUPLICATE KEY UPDATE status='INVITED',inviter_id=VALUES(inviter_id),invite_version=invite_version+1,invited_at=NOW(3),responded_at=NULL",trip,other,me);
        long version=access.count("SELECT invite_version FROM tm_journey_group_member WHERE travel_id=? AND user_id=?",trip,other);
        social.notifyEvent(other,me,"GROUP_INVITE",version,trip,"邀请你加入旅行群聊");push.hint(me);
    }
    public List<Map<String,Object>> invitations(long me) {
        return db.queryForList("SELECT g.travel_id AS travelId,g.status,g.invite_version AS inviteVersion,g.invited_at AS invitedAt,t.title AS travelTitle,u.nickname,u.username FROM tm_journey_group_member g JOIN travel_project t ON t.id=g.travel_id JOIN user u ON u.id=g.inviter_id WHERE g.user_id=? AND g.status='INVITED' AND EXISTS(SELECT 1 FROM travel_collab_member c WHERE c.travel_id=g.travel_id AND c.user_id=g.user_id AND c.status='ACTIVE') ORDER BY g.invited_at DESC",me);
    }
    @Transactional public void decide(long me,long trip,long version,boolean accept) {
        long owner=access.requireMember(me,trip,true);access.requireEnabled(trip);
        var rows=db.queryForList("SELECT status,invite_version,inviter_id FROM tm_journey_group_member WHERE travel_id=? AND user_id=? FOR UPDATE",trip,me);
        if(rows.isEmpty())throw new BusinessException(404,"邀请不存在");var row=rows.get(0);
        if(((Number)row.get("invite_version")).longValue()!=version)throw new BusinessException(409,"这是旧邀请，请刷新后处理");
        String desired=accept?"ACTIVE":"DECLINED";
        if(desired.equals(row.get("status")))return;
        if(!"INVITED".equals(row.get("status"))||row.get("inviter_id")==null||((Number)row.get("inviter_id")).longValue()!=owner)
            throw new BusinessException(409,"邀请已失效");
        db.update("UPDATE tm_journey_group_member SET status=?,responded_at=NOW(3),joined_at=IF(?=1,NOW(3),joined_at) WHERE travel_id=? AND user_id=?",desired,accept?1:0,trip,me);
        // Newly accepting users start from the current history boundary; later arrivals remain unread.
        if(accept)db.update("INSERT INTO tm_journey_group_read(travel_id,user_id,last_read_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_read_id=VALUES(last_read_id)",trip,me,access.count("SELECT COALESCE(MAX(id),0) FROM tm_journey_group_message WHERE travel_id=?",trip));
        settleNotice(me,trip);
        social.notifyEvent(owner,me,accept?"GROUP_ACCEPTED":"GROUP_DECLINED",version,trip,accept?"接受了群聊邀请":"拒绝了群聊邀请");push.hint(me);
    }
    public void settleNotice(long user,long trip) {
        db.update("UPDATE tm_social_notification SET is_read=1 WHERE recipient_id=? AND travel_id=? AND event_type='GROUP_INVITE'",user,trip);
    }
    @Transactional public void leave(long me,long trip) {
        requireActive(me,trip,true);
        db.update("UPDATE tm_journey_group_member SET status='LEFT',responded_at=NOW(3) WHERE travel_id=? AND user_id=?",trip,me);push.hint(me);
    }
    @Transactional public void remove(long me,long trip,long other) {
        access.requireOwner(me,trip,true);if(other==me)throw new BusinessException("请使用退出群聊");
        revoke(other,trip);social.notifyEvent(other,me,"GROUP_REMOVED",null,trip,"已将你移出旅行群聊");push.hint(me);
    }
    public void revoke(long user,long trip) {
        db.update("UPDATE tm_journey_group_member SET status='REMOVED',responded_at=NOW(3),invite_version=invite_version+1 WHERE travel_id=? AND user_id=? AND status IN ('ACTIVE','INVITED')",trip,user);
        settleNotice(user,trip);push.hint(user);
    }
    public List<Map<String,Object>> conversations(long me) {
        return db.queryForList("SELECT t.id,'TRAVEL_GROUP' AS type,t.id AS travelId,t.title AS nickname,NULL AS avatar,t.title AS title, " +
            "(SELECT m.body FROM tm_journey_group_message m WHERE m.travel_id=t.id ORDER BY m.id DESC LIMIT 1) AS latest,"+
            "COALESCE((SELECT MAX(m.created_at) FROM tm_journey_group_message m WHERE m.travel_id=t.id),g.joined_at) AS updatedAt,"+
            "(SELECT COUNT(*) FROM tm_journey_group_message m WHERE m.travel_id=t.id AND m.sender_id<>? AND m.id>COALESCE(r.last_read_id,0)) AS unread "+
            "FROM tm_journey_group_member g JOIN travel_project t ON t.id=g.travel_id LEFT JOIN tm_journey_group_read r ON r.travel_id=g.travel_id AND r.user_id=g.user_id "+
            "WHERE g.user_id=? AND g.status='ACTIVE' AND (t.user_id=? OR EXISTS(SELECT 1 FROM travel_collab_member c WHERE c.travel_id=t.id AND c.user_id=? AND c.status='ACTIVE')) ORDER BY updatedAt DESC LIMIT 100",me,me,me,me);
    }
    public long unread(long me) {
        return access.count("SELECT COUNT(*) FROM tm_journey_group_message m JOIN tm_journey_group_member g ON g.travel_id=m.travel_id AND g.user_id=? AND g.status='ACTIVE' JOIN travel_project t ON t.id=m.travel_id LEFT JOIN tm_journey_group_read r ON r.travel_id=m.travel_id AND r.user_id=? WHERE m.sender_id<>? AND m.id>COALESCE(r.last_read_id,0) AND (t.user_id=? OR EXISTS(SELECT 1 FROM travel_collab_member c WHERE c.travel_id=t.id AND c.user_id=? AND c.status='ACTIVE'))",me,me,me,me,me);
    }
    public List<Map<String,Object>> chat(long me,long trip,long before) {
        requireActive(me,trip,false);
        return db.queryForList("SELECT m.id,m.sender_id AS senderId,m.body,m.created_at AS createdAt,u.nickname,u.username,u.avatar FROM tm_journey_group_message m JOIN user u ON u.id=m.sender_id WHERE m.travel_id=? AND m.id<? ORDER BY m.id DESC LIMIT 60",trip,before>0?before:Long.MAX_VALUE);
    }
    @Transactional public long send(long me,long trip,String body,String clientId) {
        requireActive(me,trip,true);
        String message=body==null?"":body.trim();
        if(message.isEmpty()||message.length()>1000)throw new BusinessException("群消息应为1～1000字");
        if(clientId==null||!clientId.matches("[a-zA-Z0-9-]{8,64}"))throw new BusinessException("消息标识无效");
        var prior=db.queryForList("SELECT id FROM tm_journey_group_message WHERE travel_id=? AND sender_id=? AND client_id=?",Long.class,trip,me,clientId);
        if(!prior.isEmpty())return prior.get(0);
        if(access.count("SELECT COUNT(*) FROM tm_journey_group_message WHERE sender_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 MINUTE)",me)>=50)throw new BusinessException(429,"发送太频繁");
        db.update("INSERT INTO tm_journey_group_message(travel_id,sender_id,body,client_id) VALUES (?,?,?,?)",trip,me,message,clientId);
        long id=access.count("SELECT LAST_INSERT_ID()");
        for(Long to:db.queryForList("SELECT user_id FROM tm_journey_group_member WHERE travel_id=? AND status='ACTIVE'",Long.class,trip))push.hint(to);
        return id;
    }
    @Transactional public void read(long me,long trip,long through) {
        requireActive(me,trip,true);if(through<=0)return;
        if(access.count("SELECT COUNT(*) FROM tm_journey_group_message WHERE travel_id=? AND id=?",trip,through)!=1)throw new BusinessException("无效已读位置");
        db.update("INSERT INTO tm_journey_group_read(travel_id,user_id,last_read_id) VALUES (?,?,?) ON DUPLICATE KEY UPDATE last_read_id=GREATEST(last_read_id,VALUES(last_read_id))",trip,me,through);push.hint(me);
    }
}
