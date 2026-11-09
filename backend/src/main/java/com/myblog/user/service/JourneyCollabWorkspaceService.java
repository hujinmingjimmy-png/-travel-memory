package com.myblog.user.service;

import com.myblog.user.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.core.io.Resource;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.*;

@Service
public class JourneyCollabWorkspaceService {
    private final JdbcTemplate db;
    private final SocialHubService social;
    private final SocialHubPush push;
    private final Path storage;
    private final JourneyAccessService access;
    private final JourneyGroupService groups;
    private final TravelMediaService media;

    public JourneyCollabWorkspaceService(JdbcTemplate db, SocialHubService social, SocialHubPush push, JourneyAccessService access, JourneyGroupService groups, TravelMediaService media,
            @Value("${travel.collab.upload-dir:data/private-collab}") String uploadDir) {
        this.db = db;
        this.access=access;this.groups=groups;this.media=media;
        this.social = social;
        this.push = push;
        this.storage = Path.of(uploadDir).toAbsolutePath().normalize();
    }

    private long number(String sql, Object... args) {
        Long n = db.queryForObject(sql, Long.class, args);
        return n == null ? 0 : n;
    }
    private long ownerId(long travelId) {
        List<Long> owners = db.queryForList("SELECT user_id FROM travel_project WHERE id=?", Long.class, travelId);
        if (owners.isEmpty()) throw new BusinessException(404, "旅行不存在");
        return owners.get(0);
    }
    private boolean isOwner(long me,long trip) { return ownerId(trip) == me; }
    private void requireMember(long me,long trip) {
        if (isOwner(me,trip)) return;
        if (number("SELECT COUNT(*) FROM travel_collab_member WHERE travel_id=? AND user_id=? AND status='ACTIVE'",trip,me) == 0)
            throw new BusinessException(403, "仅此旅程正式成员可以访问共创空间");
    }
    private void requireOwner(long me,long trip) {
        if (!isOwner(me,trip)) throw new BusinessException(403,"仅创建者可以执行此操作");
    }
    private Map<String,Object> policy(long trip) { return access.policy(trip); }
    private boolean flag(Map<String,Object> p,String k) {return JourneyAccessService.flag(p,k);}
    private void canSubmit(long me,long trip) {access.canSubmit(me,trip);}
    private String state(long me,long trip) {return isOwner(me,trip)||!flag(policy(trip),"reviewRequired")?"APPROVED":"PENDING";}
    private String text(String raw, int max, String label) {
        String value=raw==null?"":raw.trim();
        if (value.isEmpty()||value.length()>max) throw new BusinessException(label+"长度不符合要求");
        return value;
    }
    private List<Long> recipients(long trip,long actor) {
        List<Long> ids=new ArrayList<>();
        long owner=ownerId(trip); if(owner!=actor) ids.add(owner);
        for (Long id:db.queryForList("SELECT user_id FROM travel_collab_member WHERE travel_id=? AND status='ACTIVE' AND user_id<>?",Long.class,trip,actor)) {
            if(id!=owner && !ids.contains(id))ids.add(id);
        }
        return ids;
    }
    private void notifyOwner(long trip,long actor,long postId,String label) {
        long owner=ownerId(trip);
        if(owner!=actor) social.notifyEvent(owner,actor,"COLLAB_SUBMITTED",postId,trip,label);
    }
    public Map<String,Object> overview(long me,long trip) {
        requireMember(me,trip);
        List<Map<String,Object>> members = new ArrayList<>(db.queryForList(
          "SELECT u.id AS userId,u.nickname,u.username,u.avatar,'OWNER' AS role FROM travel_project t JOIN user u ON u.id=t.user_id WHERE t.id=?",trip));
        members.addAll(db.queryForList("SELECT u.id AS userId,u.nickname,u.username,u.avatar,'COLLABORATOR' AS role " +
          "FROM travel_collab_member m JOIN user u ON u.id=m.user_id AND u.status=1 WHERE m.travel_id=? AND m.status='ACTIVE' AND u.id<>? ORDER BY m.joined_at",trip,ownerId(trip)));
        Map<String,Object> result=new LinkedHashMap<>();
        result.put("role",isOwner(me,trip)?"OWNER":"COLLABORATOR");
        result.put("members",members);
        result.put("policy",policy(trip));
        result.put("groupState",groups.state(me,trip));
        result.put("groupMembers",isOwner(me,trip)?groups.members(me,trip):List.of());
        result.put("hasHistory",number("SELECT COUNT(*) FROM tm_journey_contribution WHERE travel_id=?",trip)>0);
        return result;
    }
    @Transactional public void savePolicy(long me,long trip,boolean enabled,boolean allow,boolean review,long version) {
        access.requireOwner(me,trip,true);
        long current=((Number)policy(trip).get("version")).longValue();
        if(current!=version)throw new BusinessException(409,"设置已被更新，请刷新后重试");
        db.update("INSERT INTO tm_journey_policy(travel_id,collab_enabled,members_can_submit,review_required,version) VALUES (?,?,?,?,1) ON DUPLICATE KEY UPDATE collab_enabled=VALUES(collab_enabled),members_can_submit=VALUES(members_can_submit),review_required=VALUES(review_required),version=version+1",trip,enabled,allow,review);
        if(!enabled){
            db.update("UPDATE travel_collab_invite SET status='CANCELED',responded_at=NOW() WHERE travel_id=? AND status='PENDING'",trip);
            db.update("UPDATE tm_journey_group_member SET status='CANCELED',invite_version=invite_version+1,responded_at=NOW(3) WHERE travel_id=? AND status='INVITED'",trip);
            db.update("UPDATE tm_social_notification SET is_read=1 WHERE travel_id=? AND event_type IN ('TRAVEL_INVITE','GROUP_INVITE')",trip);
        }
        for(Long id:recipients(trip,me))push.hint(id);
        push.hint(me);
    }
    private String client(String value) {
        if(value==null||!value.matches("[a-zA-Z0-9-]{8,64}"))throw new BusinessException("无效投稿标识");return value;
    }
    private Long existing(long me,long trip,String clientId) {
        var ids=db.queryForList("SELECT id FROM tm_journey_contribution WHERE travel_id=? AND author_id=? AND client_id=?",Long.class,trip,me,client(clientId));return ids.isEmpty()?null:ids.get(0);
    }
    public Map<String,Object> submission(long me,long trip,long id) {
        requireMember(me,trip);
        var rows=db.queryForList("SELECT id,status FROM tm_journey_contribution WHERE travel_id=? AND id=? AND author_id=?",trip,id,me);
        if(rows.isEmpty())throw new BusinessException(404,"作品不存在");return rows.get(0);
    }
    @Transactional public long fromAlbum(long me,long trip,long mediaId,String title,String clientId) {
        access.requireOwner(me,trip,true);access.requireEnabled(trip);
        Long old=existing(me,trip,clientId);if(old!=null)return old;
        var rows=db.queryForList("SELECT id,mime_type,file_size FROM travel_media WHERE id=? AND travel_id=? FOR UPDATE",mediaId,trip);
        if(rows.isEmpty())throw new BusinessException(404,"照片不属于这段旅行");
        var prior=db.queryForList("SELECT id FROM tm_journey_contribution WHERE travel_id=? AND source_media_id=?",Long.class,trip,mediaId);
        if(!prior.isEmpty())return prior.get(0);
        media.read(me,trip,mediaId);
        String name=text(title,100,"照片说明");var photo=rows.get(0);
        db.update("INSERT INTO tm_journey_contribution(travel_id,author_id,kind,title,body,source_media_id,mime_type,file_bytes,status,client_id) VALUES (?,?,'PHOTO',?,'',?,?,?,'APPROVED',?)",trip,me,name,mediaId,photo.get("mime_type"),photo.get("file_size"),clientId);
        long id=number("SELECT LAST_INSERT_ID()");
        for(Long to:recipients(trip,me))social.notifyEvent(to,me,"COLLAB_APPROVED",id,trip,"新增了共同旅行照片");return id;
    }
    @Transactional public void removePost(long me,long trip,long postId) {
        access.requireOwner(me,trip,true);
        // Keep historical upload files; this action only revokes the shared-work record.
        if(db.update("DELETE FROM tm_journey_contribution WHERE id=? AND travel_id=?",postId,trip)!=1)throw new BusinessException(404,"作品不存在");
        for(Long to:recipients(trip,me))push.hint(to);
    }
    public List<Map<String,Object>> contributions(long me,long trip) {
        requireMember(me,trip);
        return db.queryForList("SELECT p.id,p.kind,p.title,p.body,p.status,p.author_id AS authorId,p.created_at AS createdAt,p.mime_type AS mimeType, " +
             "u.nickname,u.username,u.avatar FROM tm_journey_contribution p JOIN user u ON u.id=p.author_id " +
             "WHERE p.travel_id=? AND (p.status='APPROVED' OR p.author_id=? OR ?=1) ORDER BY p.id DESC LIMIT 200",trip,me,isOwner(me,trip)?1:0);
    }
    @Transactional public long submitStory(long me,long trip,String title,String body,String clientId) {
        canSubmit(me,trip);
        Long old=existing(me,trip,clientId);if(old!=null)return old;
        String name=text(title,100,"标题"), content=text(body,1500,"故事内容");
        String state=state(me,trip);
        db.update("INSERT INTO tm_journey_contribution(travel_id,author_id,kind,title,body,status,client_id) VALUES (?,?,'STORY',?,?,?,?)",trip,me,name,content,state,clientId);
        long id=number("SELECT LAST_INSERT_ID()");
        if("PENDING".equals(state))notifyOwner(trip,me,id,"提交了待审核的共同旅行故事");
        else for(Long to:recipients(trip,me))social.notifyEvent(to,me,"COLLAB_APPROVED",id,trip,"新增了共同旅行故事");
        return id;
    }
    private static String imageType(byte[] header) {
        if(header.length>=3 && (header[0]&255)==255 && (header[1]&255)==216 && (header[2]&255)==255)return "image/jpeg";
        if(header.length>=8 && (header[0]&255)==137 && header[1]==80 && header[2]==78 && header[3]==71 && header[4]==13 && header[5]==10 && header[6]==26 && header[7]==10)return "image/png";
        if(header.length>=12 && header[0]==82 && header[1]==73 && header[2]==70 && header[3]==70 && header[8]==87 && header[9]==69 && header[10]==66 && header[11]==80)return "image/webp";
        return "";
    }
    @Transactional public long submitPhoto(long me,long trip,String title,MultipartFile file,String clientId) throws IOException {
        canSubmit(me,trip);
        Long old=existing(me,trip,clientId);if(old!=null)return old;
        String name=text(title,100,"照片说明");
        if(file==null||file.isEmpty()||file.getSize()>5L*1024*1024)throw new BusinessException("请选择不超过 5MB 的照片");
        byte[] header;
        try(InputStream in=file.getInputStream()){header=in.readNBytes(12);}
        String mime=imageType(header);
        if(mime.isEmpty())throw new BusinessException("仅允许有效的 JPEG、PNG、WebP 图片");
        String extension=mime.equals("image/jpeg")?".jpg":mime.equals("image/png")?".png":".webp";
        Files.createDirectories(storage);
        String key=UUID.randomUUID()+extension;
        Path dest=storage.resolve(key).normalize();
        if(!dest.startsWith(storage))throw new BusinessException("文件名无效");
        try {
            try(InputStream in=file.getInputStream()) {Files.copy(in,dest);}
            if(Files.size(dest)>5L*1024*1024)throw new BusinessException("图片文件超出 5MB 限制");
            String status=state(me,trip);
            // Use a transaction template at the controller/service layer if extending this upload path.
            db.update("INSERT INTO tm_journey_contribution(travel_id,author_id,kind,title,body,file_key,mime_type,file_bytes,status,client_id) VALUES (?,?,'PHOTO',?,'',?,?,?,?,?)",trip,me,name,key,mime,Files.size(dest),status,clientId);
            long id=number("SELECT LAST_INSERT_ID()");
            if("PENDING".equals(status))notifyOwner(trip,me,id,"提交了待审核的共同旅行照片");
            else for(Long to:recipients(trip,me))social.notifyEvent(to,me,"COLLAB_APPROVED",id,trip,"新增了共同旅行照片");
            return id;
        } catch(Exception ex) {
            Files.deleteIfExists(dest);
            if(ex instanceof IOException io)throw io;
            if(ex instanceof RuntimeException runtime)throw runtime;
            throw new IOException(ex);
        }
    }
    public record Photo(Resource resource,String mime,long bytes) {}
    public Photo photo(long me,long trip,long postId) {
        requireMember(me,trip);
        List<Map<String,Object>> rows=db.queryForList("SELECT author_id,status,file_key,mime_type,file_bytes,source_media_id FROM tm_journey_contribution WHERE id=? AND travel_id=? AND kind='PHOTO'",postId,trip);
        if(rows.isEmpty())throw new BusinessException(404,"照片不存在");
        Map<String,Object> row=rows.get(0);
        if(!"APPROVED".equals(row.get("status")) && me!=((Number)row.get("author_id")).longValue() && !isOwner(me,trip))throw new BusinessException(403,"没有查看权限");
        if(row.get("source_media_id") instanceof Number source) {
            // Owner-based physical read occurs only after checking this exact contribution's membership/status.
            TravelMediaService.MediaResource resource=media.read(ownerId(trip),trip,source.longValue());
            return new Photo(resource.resource(),resource.mimeType(),resource.size());
        }
        String key=(String)row.get("file_key");
        if(key==null || !key.matches("[0-9a-fA-F-]{36}\\.(jpg|png|webp)"))throw new BusinessException(404,"文件不存在");
        Path file=storage.resolve(key).normalize();
        if(!file.startsWith(storage)||!Files.isRegularFile(file))throw new BusinessException(404,"图片文件丢失");
        return new Photo(new FileSystemResource(file), (String)row.get("mime_type"),FilesReadableSize(file));
    }
    private static long FilesReadableSize(Path file) {try{return Files.size(file);}catch(IOException e){throw new BusinessException(404,"无法读取图片");}}
    @Transactional public void review(long me,long trip,long postId,boolean approve) {
        access.requireOwner(me,trip,true);
        List<Map<String,Object>> rows=db.queryForList("SELECT author_id,status FROM tm_journey_contribution WHERE id=? AND travel_id=? FOR UPDATE",postId,trip);
        if(rows.isEmpty())throw new BusinessException(404,"投稿不存在");
        if(!"PENDING".equals(rows.get(0).get("status")))throw new BusinessException("投稿已审核");
        int updated=db.update("UPDATE tm_journey_contribution SET status=?,reviewed_by=?,reviewed_at=NOW(3) WHERE id=? AND status='PENDING'",approve?"APPROVED":"REJECTED",me,postId);
        if(updated!=1)throw new BusinessException("审核状态发生变化，请刷新");
        long author=((Number)rows.get(0).get("author_id")).longValue();
        social.notifyEvent(author,me,approve?"COLLAB_APPROVED":"COLLAB_REJECTED",postId,trip,approve?"通过了你的旅行投稿":"退回了你的旅行投稿");
        if(approve)for(Long to:recipients(trip,me))if(to!=author)social.notifyEvent(to,me,"COLLAB_APPROVED",postId,trip,"共同旅行有新作品");
    }
    public List<Map<String,Object>> chat(long me,long trip,long before) {return groups.chat(me,trip,before);}
    public long send(long me,long trip,String body,String clientId) {return groups.send(me,trip,body,clientId);}
    public void readChat(long me,long trip,long through) {groups.read(me,trip,through);}
}
