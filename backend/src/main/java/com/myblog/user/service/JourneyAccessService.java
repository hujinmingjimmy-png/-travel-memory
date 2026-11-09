package com.myblog.user.service;

import com.myblog.user.exception.BusinessException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import java.util.*;

/** Central rules; writes lock the trip first so disabling and invitation decisions cannot race. */
@Service
public class JourneyAccessService {
    private final JdbcTemplate db;
    public JourneyAccessService(JdbcTemplate db) { this.db = db; }
    public long owner(long trip, boolean lock) {
        var ids = db.queryForList("SELECT user_id FROM travel_project WHERE id=?" + (lock ? " FOR UPDATE" : ""), Long.class, trip);
        if (ids.isEmpty()) throw new BusinessException(404, "旅行不存在");
        return ids.get(0);
    }
    public boolean member(long me,long trip) {
        return owner(trip,false)==me || count("SELECT COUNT(*) FROM travel_collab_member WHERE travel_id=? AND user_id=? AND status='ACTIVE'",trip,me)>0;
    }
    public long requireMember(long me,long trip,boolean lock) {
        long owner=owner(trip,lock);
        if(owner!=me && count("SELECT COUNT(*) FROM travel_collab_member WHERE travel_id=? AND user_id=? AND status='ACTIVE'",trip,me)==0)
            throw new BusinessException(403,"你已不具备这段旅行的成员权限");
        return owner;
    }
    public void requireOwner(long me,long trip,boolean lock) {
        if(owner(trip,lock)!=me)throw new BusinessException(403,"仅创建者可以执行此操作");
    }
    public Map<String,Object> policy(long trip) {
        var rows=db.queryForList("SELECT collab_enabled AS enabled,members_can_submit AS membersCanSubmit,review_required AS reviewRequired,version FROM tm_journey_policy WHERE travel_id=?",trip);
        return rows.isEmpty()?Map.of("enabled",false,"membersCanSubmit",true,"reviewRequired",true,"version",0):rows.get(0);
    }
    public static boolean flag(Map<String,Object> p,String key) {
        Object v=p.get(key); return v instanceof Boolean b?b:v instanceof Number n?n.intValue()!=0:"true".equalsIgnoreCase(String.valueOf(v))||"1".equals(String.valueOf(v));
    }
    public void requireEnabled(long trip) {
        if(!flag(policy(trip),"enabled"))throw new BusinessException(409,"创建者尚未开启或已关闭共创");
    }
    public void canSubmit(long me,long trip) {
        long owner=requireMember(me,trip,true); requireEnabled(trip);
        if(owner!=me && !flag(policy(trip),"membersCanSubmit"))throw new BusinessException(403,"创建者已关闭同行投稿");
    }
    public long count(String sql,Object...args) { Long n=db.queryForObject(sql,Long.class,args);return n==null?0:n; }
}
