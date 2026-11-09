package com.myblog.user.service;

import com.myblog.user.exception.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import java.util.*;

@Service
public class SocialHubService {
    private final JdbcTemplate db;
    private final SocialHubPush push;
    public SocialHubService(JdbcTemplate db,SocialHubPush push){this.db=db;this.push=push;}
    private long low(long a,long b){return Math.min(a,b);}
    private long high(long a,long b){return Math.max(a,b);}
    private long count(String sql,Object...args){Long n=db.queryForObject(sql,Long.class,args);return n==null?0:n;}
    private void requireUser(long id) {if(count("SELECT COUNT(*) FROM user WHERE id=? AND status=1",id)!=1)throw new BusinessException(404,"用户不存在");}
    private void requireOther(long me,long other) {if(me==other)throw new BusinessException("不能操作自己");requireUser(other);}
    public boolean friends(long me,long other){return count("SELECT COUNT(*) FROM tm_friendship WHERE user_low=? AND user_high=?",low(me,other),high(me,other))>0;}
    public List<Map<String,Object>> search(long me,String keyword){
        String q=keyword==null?"":keyword.trim();if(q.length()<1||q.length()>40)return List.of();
        return db.queryForList("SELECT u.id AS userId,u.username,u.nickname,u.avatar, CASE WHEN f.user_low IS NULL THEN 0 ELSE 1 END AS isFriend " +
           "FROM user u LEFT JOIN tm_friendship f ON f.user_low=LEAST(u.id,?) AND f.user_high=GREATEST(u.id,?) " +
           "WHERE u.status=1 AND u.id<>? AND (u.username LIKE ? OR u.nickname LIKE ?) ORDER BY u.username LIMIT 20",me,me,me,"%"+q+"%","%"+q+"%");
    }
    // Explicit mutual following creates a friendship. Manual requests remain independent.
    @Transactional public void syncFollow(long me,long other,boolean follow){
        long a=low(me,other),b=high(me,other);
        if(follow){
            if(count("SELECT COUNT(*) FROM user_follow WHERE follower_id=? AND followed_id=?",other,me)==0)return;
            // Mark auto-generated relationships only if neither kind of friendship exists yet.
            if(count("SELECT COUNT(*) FROM tm_friendship WHERE user_low=? AND user_high=?",a,b)==0){
                db.update("INSERT IGNORE INTO tm_auto_friendship(user_low,user_high) VALUES (?,?)",a,b);
                db.update("INSERT IGNORE INTO tm_friendship(user_low,user_high) VALUES (?,?)",a,b);
                notifyEvent(other,me,"MUTUAL_FOLLOW_FRIEND",null,null,"和你互相关注，已成为好友");
            }
        }else{
            int removed=db.update("DELETE FROM tm_auto_friendship WHERE user_low=? AND user_high=?",a,b);
            if(removed>0){
                db.update("DELETE FROM tm_friendship WHERE user_low=? AND user_high=?",a,b);
                push.hint(me);push.hint(other);
            }
        }
    }
    public List<Map<String,Object>> followers(long me){return db.queryForList(
        "SELECT u.id AS userId,u.username,u.nickname,u.avatar,CASE WHEN f.user_low IS NULL THEN 0 ELSE 1 END AS isFriend " +
        "FROM user_follow x JOIN user u ON u.id=x.follower_id AND u.status=1 " +
        "LEFT JOIN tm_friendship f ON f.user_low=LEAST(u.id,?) AND f.user_high=GREATEST(u.id,?) " +
        "WHERE x.followed_id=? ORDER BY u.id DESC LIMIT 300",me,me,me);
    }
    public List<Map<String,Object>> following(long me){return db.queryForList(
        "SELECT u.id AS userId,u.username,u.nickname,u.avatar,CASE WHEN f.user_low IS NULL THEN 0 ELSE 1 END AS isFriend " +
        "FROM user_follow x JOIN user u ON u.id=x.followed_id AND u.status=1 " +
        "LEFT JOIN tm_friendship f ON f.user_low=LEAST(u.id,?) AND f.user_high=GREATEST(u.id,?) " +
        "WHERE x.follower_id=? ORDER BY u.id DESC LIMIT 300",me,me,me);
    }
    public List<Map<String,Object>> friendList(long me){return db.queryForList(
        "SELECT u.id AS userId,u.username,u.nickname,u.avatar FROM tm_friendship f JOIN user u " +
        "ON u.id=IF(f.user_low=?,f.user_high,f.user_low) WHERE (f.user_low=? OR f.user_high=?) AND u.status=1 ORDER BY u.username LIMIT 300",me,me,me);
    }
    public List<Map<String,Object>> requests(long me){return db.queryForList(
        "SELECT r.id,r.requester_id AS requesterId,r.receiver_id AS receiverId,r.status,r.created_at AS createdAt," +
        "u.id AS userId,u.username,u.nickname,u.avatar FROM tm_friend_request r JOIN user u ON u.id=IF(r.requester_id=?,r.receiver_id,r.requester_id) " +
        "WHERE r.requester_id=? OR r.receiver_id=? ORDER BY r.updated_at DESC LIMIT 100",me,me,me);
    }
    @Transactional public void request(long me,String username){
        String name=username==null?"":username.trim();if(name.length()<2||name.length()>50)throw new BusinessException("用户名长度不正确");
        var targets=db.queryForList("SELECT id FROM user WHERE username=? AND status=1",Long.class,name);
        if(targets.isEmpty())throw new BusinessException(404,"用户不存在");long other=targets.get(0);requireOther(me,other);
        if(friends(me,other))throw new BusinessException("已经是好友");
        var rows=db.queryForList("SELECT id,status,requester_id FROM tm_friend_request WHERE user_low=? AND user_high=? FOR UPDATE",low(me,other),high(me,other));
        if(!rows.isEmpty()){
            var r=rows.get(0);
            if("PENDING".equals(r.get("status")))throw new BusinessException("已有待处理好友申请");
            db.update("UPDATE tm_friend_request SET requester_id=?,receiver_id=?,status='PENDING',created_at=NOW(3) WHERE id=?",me,other,r.get("id"));
        } else db.update("INSERT INTO tm_friend_request(user_low,user_high,requester_id,receiver_id,status) VALUES (?,?,?,?,'PENDING')",low(me,other),high(me,other),me,other);
        notifyEvent(other,me,"FRIEND_REQUEST",null,null,"向你发送了好友申请");
    }
    @Transactional public void decide(long me,long id,boolean accept){
        var rows=db.queryForList("SELECT requester_id,receiver_id,status FROM tm_friend_request WHERE id=? FOR UPDATE",id);
        if(rows.isEmpty())throw new BusinessException(404,"好友申请不存在");var r=rows.get(0);
        long requester=((Number)r.get("requester_id")).longValue();long receiver=((Number)r.get("receiver_id")).longValue();
        if(receiver!=me)throw new BusinessException(403,"只能处理自己的好友申请");
        if(!"PENDING".equals(r.get("status")))throw new BusinessException("申请已处理");
        db.update("UPDATE tm_friend_request SET status=? WHERE id=?",accept?"ACCEPTED":"REJECTED",id);
        if(accept){
            db.update("INSERT IGNORE INTO tm_friendship(user_low,user_high) VALUES (?,?)",low(me,requester),high(me,requester));
            db.update("DELETE FROM tm_auto_friendship WHERE user_low=? AND user_high=?",low(me,requester),high(me,requester));
        }
        notifyEvent(requester,me,accept?"FRIEND_ACCEPTED":"FRIEND_REJECTED",id,null,accept?"接受了好友申请":"拒绝了好友申请");
        push.hint(me);
    }
    @Transactional public void cancel(long me,long id){
        int n=db.update("UPDATE tm_friend_request SET status='CANCELED' WHERE id=? AND requester_id=? AND status='PENDING'",id,me);
        if(n!=1)throw new BusinessException("无法撤回此申请");push.hint(me);
    }
    @Transactional public void unfriend(long me,long other){
        requireOther(me,other);db.update("DELETE FROM tm_friendship WHERE user_low=? AND user_high=?",low(me,other),high(me,other));
        db.update("UPDATE tm_friend_request SET status='REMOVED' WHERE user_low=? AND user_high=?",low(me,other),high(me,other));
        db.update("DELETE FROM tm_auto_friendship WHERE user_low=? AND user_high=?",low(me,other),high(me,other));
        push.hint(other);push.hint(me);
    }
    @Transactional public void notifyEvent(long recipient,long actor,String type,Long reference,Long travel,String title){
        if(recipient==actor)return;
        db.update("INSERT INTO tm_social_notification(recipient_id,actor_id,event_type,reference_id,travel_id,title) VALUES (?,?,?,?,?,?)",recipient,actor,type,reference,travel,title);
        push.hint(recipient);
    }
    public List<Map<String,Object>> notifications(long me,int page){int p=Math.min(200,Math.max(1,page));return db.queryForList(
        "SELECT n.id,n.event_type AS eventType,n.title,n.reference_id AS referenceId,n.travel_id AS travelId,"+
        "n.is_read AS isRead,n.created_at AS createdAt,u.id AS actorId,u.nickname AS actorNickname,u.username AS actorUsername,u.avatar AS actorAvatar " +
        "FROM tm_social_notification n JOIN user u ON u.id=n.actor_id WHERE n.recipient_id=? ORDER BY n.id DESC LIMIT 30 OFFSET ?",me,(p-1)*30);
    }
    @Transactional public void readNotifications(long me){db.update("UPDATE tm_social_notification SET is_read=1 WHERE recipient_id=? AND is_read=0",me);push.hint(me);}
    private long requireConversation(long me,long other){
        if(!friends(me,other))throw new BusinessException(403,"仅好友可以私信");
        var ids=db.queryForList("SELECT id FROM tm_chat_conversation WHERE user_low=? AND user_high=?",Long.class,low(me,other),high(me,other));
        return ids.isEmpty()?0:ids.get(0);
    }
    public List<Map<String,Object>> conversations(long me){return db.queryForList(
        "SELECT c.id,IF(c.user_low=?,c.user_high,c.user_low) AS otherId,u.username,u.nickname,u.avatar,"+
        "(SELECT m.body FROM tm_chat_message m WHERE m.conversation_id=c.id ORDER BY m.id DESC LIMIT 1) AS latest,"+
        "(SELECT COUNT(*) FROM tm_chat_message m WHERE m.conversation_id=c.id AND m.sender_id<>? AND m.id>IF(c.user_low=?,c.last_read_low,c.last_read_high)) AS unread,"+
        "c.updated_at AS updatedAt FROM tm_chat_conversation c JOIN user u ON u.id=IF(c.user_low=?,c.user_high,c.user_low) " +
        "JOIN tm_friendship f ON f.user_low=c.user_low AND f.user_high=c.user_high WHERE c.user_low=? OR c.user_high=? ORDER BY c.updated_at DESC LIMIT 100",me,me,me,me,me,me);
    }
    public List<Map<String,Object>> messages(long me,long other,long before){
        long id=requireConversation(me,other);if(id==0)return List.of();
        // TRAVEL_CHAT_V13: keep existing message pagination and enrich with private-media metadata.
        return db.queryForList("SELECT m.id,m.sender_id AS senderId,m.body,m.created_at AS createdAt, " +
        "COALESCE(e.kind,'TEXT') AS kind,e.reply_to_id AS replyToId,e.revoked_at AS revokedAt, " +
        "(SELECT q.body FROM tm_chat_message q WHERE q.id=e.reply_to_id AND q.conversation_id=m.conversation_id) AS replyPreview " +
        "FROM tm_chat_message m LEFT JOIN tm_chat_message_extra e ON e.message_id=m.id " +
        "WHERE m.conversation_id=? AND m.id<? ORDER BY m.id DESC LIMIT 40",id,before>0?before:Long.MAX_VALUE);
    }
    @Transactional public Map<String,Object> send(long me,long other,String body,String clientId){
        requireOther(me,other);requireConversation(me,other);
        String msg=body==null?"":body.trim();if(msg.isEmpty()||msg.length()>2000)throw new BusinessException("消息长度须为1到2000字");
        if(count("SELECT COUNT(*) FROM tm_chat_message WHERE sender_id=? AND created_at>DATE_SUB(NOW(),INTERVAL 1 MINUTE)",me)>=60)throw new BusinessException(429,"消息太频繁，请稍后再发");
        if(clientId==null||!clientId.matches("[a-zA-Z0-9-]{8,64}"))throw new BusinessException("无效消息标识");
        db.update("INSERT INTO tm_chat_conversation(user_low,user_high) VALUES (?,?) ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",low(me,other),high(me,other));
        long id=requireConversation(me,other);
        db.update("INSERT INTO tm_chat_message(conversation_id,sender_id,body,client_id) VALUES (?,?,?,?) " +
                "ON DUPLICATE KEY UPDATE id=LAST_INSERT_ID(id)",id,me,msg,clientId);
        db.update("UPDATE tm_chat_conversation SET updated_at=NOW(3) WHERE id=?",id);
        push.hint(other);push.hint(me);
        return Map.of("conversationId",id,"delivered",true);
    }
    @Transactional public void readConversation(long me,long other){
        long id=requireConversation(me,other);if(id==0)return;
        long max=count("SELECT COALESCE(MAX(id),0) FROM tm_chat_message WHERE conversation_id=?",id);
        db.update(me==low(me,other)?"UPDATE tm_chat_conversation SET last_read_low=GREATEST(last_read_low,?) WHERE id=?":"UPDATE tm_chat_conversation SET last_read_high=GREATEST(last_read_high,?) WHERE id=?",max,id);
        push.hint(me);
    }
    public Map<String,Long> counts(long me){
        return Map.of("notifications",count("SELECT COUNT(*) FROM tm_social_notification WHERE recipient_id=? AND is_read=0",me),
                "friendRequests",count("SELECT COUNT(*) FROM tm_friend_request WHERE receiver_id=? AND status='PENDING'",me),
                "messages",count("SELECT COUNT(*) FROM tm_chat_message m JOIN tm_chat_conversation c ON c.id=m.conversation_id JOIN tm_friendship f ON f.user_low=c.user_low AND f.user_high=c.user_high WHERE (c.user_low=? OR c.user_high=?) AND m.sender_id<>? AND m.id>IF(c.user_low=?,c.last_read_low,c.last_read_high)",me,me,me,me));
    }
}
