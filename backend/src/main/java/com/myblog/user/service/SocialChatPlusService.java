package com.myblog.user.service;

import com.myblog.user.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;
import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardOpenOption;
import java.sql.Timestamp;
import java.util.List;
import java.util.Map;
import java.util.UUID;

/** v13: authenticated media, replies, recalls, and per-conversation search. */
@Service
public class SocialChatPlusService {
    private static final int MAX_IMAGE = 5 * 1024 * 1024;
    private final JdbcTemplate db;
    private final SocialHubService hub;
    private final SocialHubPush push;
    private final Path privateDir;

    public SocialChatPlusService(JdbcTemplate db, SocialHubService hub, SocialHubPush push,
            @Value("${travel.chat.upload-dir:./data/private-chat}") String dir) {
        this.db = db;
        this.hub = hub;
        this.push = push;
        this.privateDir = Path.of(dir).toAbsolutePath().normalize();
    }

    private long conversation(long me, long other) {
        if (me == other || !hub.friends(me, other))
            throw new BusinessException(403, "仅好友可访问私信");
        List<Long> ids = db.queryForList(
                "SELECT id FROM tm_chat_conversation WHERE user_low=? AND user_high=?",
                Long.class, Math.min(me,other), Math.max(me,other));
        return ids.isEmpty() ? 0 : ids.get(0);
    }

    private Map<String,Object> message(long convo, long id) {
        var rows = db.queryForList(
                "SELECT m.id, m.sender_id AS senderId, m.body, m.created_at AS createdAt, " +
                "e.kind, e.file_name AS fileName, e.mime_type AS mimeType, " +
                "e.revoked_at AS revokedAt " +
                "FROM tm_chat_message m LEFT JOIN tm_chat_message_extra e ON e.message_id=m.id " +
                "WHERE m.conversation_id=? AND m.id=?", convo, id);
        if (rows.isEmpty()) throw new BusinessException(404,"消息不存在");
        return rows.get(0);
    }

    private static String sniff(byte[] bytes) {
        if (bytes.length >= 8 && bytes[0] == (byte)0x89 && bytes[1] == 0x50 &&
            bytes[2] == 0x4e && bytes[3] == 0x47 && bytes[4] == 0x0d && bytes[5] == 0x0a &&
            bytes[6] == 0x1a && bytes[7] == 0x0a) return "image/png";
        if (bytes.length >= 3 && bytes[0] == (byte)0xff && bytes[1] == (byte)0xd8 && bytes[2] == (byte)0xff)
            return "image/jpeg";
        if (bytes.length >= 12 && bytes[0]=='R' && bytes[1]=='I' && bytes[2]=='F' && bytes[3]=='F' &&
            bytes[8]=='W' && bytes[9]=='E' && bytes[10]=='B' && bytes[11]=='P') return "image/webp";
        return null;
    }

    /** Store bytes outside public and reuse the original message quota, friendship and deduplication. */
    @Transactional
    public Map<String,Object> upload(long me, long other, MultipartFile file, String clientId) throws IOException {
        conversation(me,other);
        if (file == null || file.isEmpty() || file.getSize()>MAX_IMAGE)
            throw new BusinessException("图片不得为空或超过 5MB");
        byte[] bytes = file.getBytes();
        if (bytes.length == 0 || bytes.length > MAX_IMAGE) throw new BusinessException("图片大小超出限制");
        String mime = sniff(bytes);
        if (mime == null) throw new BusinessException("只支持 JPG、PNG、WebP 图片");
        // Reject polyglot or malformed data with the browser image decoder in the client as well.
        String ext = mime.equals("image/png") ? ".png" : mime.equals("image/jpeg") ? ".jpg" : ".webp";
        String name = UUID.randomUUID().toString() + ext;
        Files.createDirectories(privateDir);
        Path target = privateDir.resolve(name).normalize();
        if (!target.startsWith(privateDir)) throw new BusinessException("图片存储路径无效");
        Files.write(target,bytes,StandardOpenOption.CREATE_NEW,StandardOpenOption.WRITE);
        try {
            hub.send(me,other,"[图片]",clientId);
            long convo = conversation(me,other);
            var ids = db.queryForList("SELECT id FROM tm_chat_message WHERE conversation_id=? AND sender_id=? AND client_id=?",
                    Long.class,convo,me,clientId);
            if (ids.isEmpty()) throw new BusinessException("图片消息创建失败");
            long messageId = ids.get(0);
            int inserted = db.update("INSERT IGNORE INTO tm_chat_message_extra(message_id,kind,file_name,mime_type) VALUES (?,'IMAGE',?,?)",
                    messageId,name,mime);
            if (inserted==0) Files.deleteIfExists(target); // Idempotent client retry.
            push.hint(other);
            return Map.of("messageId",messageId,"delivered",true);
        } catch (Exception e) {
            Files.deleteIfExists(target);
            throw e;
        }
    }

    public record ImageData(byte[] bytes,String mime){}

    public ImageData image(long me, long other, long messageId) throws IOException {
        long convo = conversation(me,other);
        if (convo==0) throw new BusinessException(404,"会话不存在");
        Map<String,Object> row=message(convo,messageId);
        if (row.get("revokedAt")!=null || !"IMAGE".equals(row.get("kind")))
            throw new BusinessException(404,"图片不可访问");
        String name=(String)row.get("fileName");
        if (name==null || !name.matches("[a-f0-9-]{36}\\.(png|jpg|webp)"))
            throw new BusinessException(404,"图片不可访问");
        Path target=privateDir.resolve(name).normalize();
        if (!target.startsWith(privateDir) || !Files.isRegularFile(target))
            throw new BusinessException(404,"图片文件不存在");
        return new ImageData(Files.readAllBytes(target),(String)row.get("mimeType"));
    }

    @Transactional
    public Map<String,Object> sendReply(long me,long other,String text,String clientId,Long replyToId) {
        long convo=conversation(me,other);
        if (replyToId!=null) {
            if (convo==0) throw new BusinessException(404,"原消息不存在");
            Map<String,Object> quoted=message(convo,replyToId);
            if (quoted.get("revokedAt")!=null) throw new BusinessException("不能引用已撤回的消息");
        }
        var result=hub.send(me,other,text,clientId);
        if (replyToId!=null) {
            long id=conversation(me,other);
            db.update("INSERT INTO tm_chat_message_extra(message_id,kind,reply_to_id) " +
                    "SELECT id,'TEXT',? FROM tm_chat_message WHERE conversation_id=? AND sender_id=? AND client_id=? " +
                    "ON DUPLICATE KEY UPDATE reply_to_id=COALESCE(reply_to_id,VALUES(reply_to_id))",
                    replyToId,id,me,clientId);
            push.hint(other);
        }
        return result;
    }

    @Transactional
    public void recall(long me,long other,long messageId) {
        long convo=conversation(me,other);
        if (convo==0) throw new BusinessException(404,"会话不存在");
        var rows=db.queryForList(
                "SELECT sender_id, TIMESTAMPDIFF(SECOND,created_at,NOW(3)) AS ageSeconds " +
                "FROM tm_chat_message WHERE id=? AND conversation_id=? FOR UPDATE",messageId,convo);
        if (rows.isEmpty()) throw new BusinessException(404,"消息不存在");
        var row=rows.get(0);
        if (((Number)row.get("sender_id")).longValue()!=me)
            throw new BusinessException(403,"只能撤回自己发送的消息");
        long age=((Number)row.get("ageSeconds")).longValue();
        if (age<0 || age>120) throw new BusinessException("只能撤回两分钟内的消息");
        Map<String,Object> m=message(convo,messageId);
        if (m.get("revokedAt")!=null) throw new BusinessException("消息已经撤回");
        db.update("UPDATE tm_chat_message SET body='[消息已撤回]' WHERE id=?",messageId);
        db.update("INSERT INTO tm_chat_message_extra(message_id,kind,revoked_at) VALUES (?,'TEXT',NOW(3)) " +
                "ON DUPLICATE KEY UPDATE revoked_at=NOW(3)",messageId);
        push.hint(me);push.hint(other);
    }

    public List<Map<String,Object>> search(long me,long other,String keyword) {
        long convo=conversation(me,other);
        if(convo==0)return List.of();
        String text=keyword==null?"":keyword.trim();
        if(text.length()<2||text.length()>80)throw new BusinessException("请输入 2–80 字搜索词");
        // Escape LIKE metacharacters, so %/_ in input are searched literally.
        String pattern="%"+text.replace("!","!!").replace("%","!%").replace("_","!_")+"%";
        return db.queryForList("SELECT m.id, m.sender_id AS senderId,m.body,m.created_at AS createdAt " +
                "FROM tm_chat_message m LEFT JOIN tm_chat_message_extra e ON e.message_id=m.id " +
                "WHERE m.conversation_id=? AND e.revoked_at IS NULL AND m.body LIKE ? ESCAPE '!' " +
                "ORDER BY m.id DESC LIMIT 40",convo,pattern);
    }
}
