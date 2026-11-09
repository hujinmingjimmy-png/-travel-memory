package com.myblog.user.controller;
import com.myblog.user.common.ApiResult;import com.myblog.user.exception.BusinessException;import com.myblog.user.vo.DiscoverPageVO;import com.myblog.user.vo.DiscoverTravelVO;import org.springframework.jdbc.core.JdbcTemplate;import org.springframework.web.bind.annotation.*;import java.util.*;
@RestController @RequestMapping("/api/discover")
public class DiscoverController{
 private final JdbcTemplate jdbc;public DiscoverController(JdbcTemplate jdbc){this.jdbc=jdbc;}
 @GetMapping("/travels")
 public ApiResult<DiscoverPageVO> discover(@RequestAttribute("userId") Long userId,@RequestParam(value="section",defaultValue="recommend") String section,@RequestParam(value="page",defaultValue="1") int page,@RequestParam(value="size",defaultValue="9") int size,@RequestParam(value="sort",defaultValue="newest") String sort,@RequestParam(value="q",defaultValue="") String search){
  int safePage=Math.min(500,Math.max(1,page)),safeSize=Math.min(24,Math.max(1,size));long offset=(long)(safePage-1)*safeSize;String keyword=search==null?"":search.trim();if(keyword.length()>50)keyword=keyword.substring(0,50);String orderBy="popular".equalsIgnoreCase(sort)?"p.like_count DESC, p.view_count DESC, p.id DESC":"p.created_at DESC, p.id DESC";
  StringBuilder sql=new StringBuilder("""
   SELECT p.id,p.title,p.subtitle,p.description,p.cover_url,p.start_date,p.end_date,p.view_count,p.like_count,p.created_at,
          p.user_id AS author_id,u.avatar AS author_avatar,COALESCE(NULLIF(u.nickname,''),u.username) AS author,
          EXISTS(SELECT 1 FROM travel_like vl WHERE vl.travel_id=p.id AND vl.user_id=?) AS liked,
          EXISTS(SELECT 1 FROM user_follow vf WHERE vf.follower_id=? AND vf.followed_id=p.user_id) AS following,
          COALESCE((SELECT om.id FROM travel_media om WHERE om.id=p.cover_media_id AND om.travel_id=p.id),(SELECT fm.id FROM travel_media fm WHERE fm.travel_id=p.id ORDER BY fm.sort_order ASC,fm.id ASC LIMIT 1)) AS cover_media_id
   FROM travel_project p INNER JOIN user u ON u.id=p.user_id
   WHERE p.visibility='PUBLIC' AND p.is_published=1 AND u.status=1
   """);
  List<Object> params=new ArrayList<>();params.add(userId);params.add(userId);
  if("follow".equals(section)){sql.append(" AND EXISTS(SELECT 1 FROM user_follow f WHERE f.follower_id=? AND f.followed_id=p.user_id) ");params.add(userId);}else if("likes".equals(section)){sql.append(" AND EXISTS(SELECT 1 FROM travel_like l WHERE l.user_id=? AND l.travel_id=p.id) ");params.add(userId);}else if(!"recommend".equals(section))throw new BusinessException("不支持的发现栏目");
  if(!keyword.isEmpty()){sql.append(" AND (LOCATE(?,p.title)>0 OR LOCATE(?,COALESCE(p.subtitle,''))>0 OR LOCATE(?,COALESCE(p.description,''))>0) ");params.add(keyword);params.add(keyword);params.add(keyword);}sql.append(" ORDER BY ").append(orderBy).append(" LIMIT ? OFFSET ?");params.add(safeSize+1);params.add(offset);
  List<Map<String,Object>> rows=jdbc.queryForList(sql.toString(),params.toArray());boolean hasMore=rows.size()>safeSize;List<DiscoverTravelVO> items=new ArrayList<>();for(int i=0;i<Math.min(safeSize,rows.size());i++)items.add(toVO(rows.get(i)));return ApiResult.success(new DiscoverPageVO(items,safePage,safeSize,hasMore));
 }
 private static DiscoverTravelVO toVO(Map<String,Object> r){DiscoverTravelVO v=new DiscoverTravelVO();v.setId(num(r.get("id")));v.setTitle(str(r.get("title")));v.setSubtitle(str(r.get("subtitle")));v.setDescription(shorten(str(r.get("description")),220));v.setAuthorId(num(r.get("author_id")));v.setAuthor(str(r.get("author")));v.setAuthorAvatar(str(r.get("author_avatar")));v.setCoverUrl(str(r.get("cover_url")));v.setCoverMediaId(num(r.get("cover_media_id")));v.setStartDate(str(r.get("start_date")));v.setEndDate(str(r.get("end_date")));v.setViewCount(num(r.get("view_count")));v.setLikeCount(num(r.get("like_count")));v.setLiked(bool(r.get("liked")));v.setFollowing(bool(r.get("following")));v.setCreatedAt(str(r.get("created_at")));return v;}
 private static Long num(Object v){return v instanceof Number?((Number)v).longValue():null;}private static boolean bool(Object v){return v instanceof Boolean?(Boolean)v:v instanceof Number&&((Number)v).intValue()!=0;}private static String str(Object v){return v==null?null:v.toString();}private static String shorten(String v,int n){return v==null||v.length()<=n?v:v.substring(0,n)+"…";}
}
