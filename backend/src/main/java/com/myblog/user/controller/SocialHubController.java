package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.SocialHubService;
import org.springframework.web.bind.annotation.*;
import java.util.*;

@RestController
@RequestMapping("/api/social-hub")
public class SocialHubController {
    private final SocialHubService s;
    private final com.myblog.user.service.JourneyGroupService groups;
    public SocialHubController(SocialHubService s,com.myblog.user.service.JourneyGroupService groups){this.s=s;this.groups=groups;}
    public record Name(String username){}
    public record Decision(boolean accept){}
    public record Message(String body,String clientId){}
    @GetMapping("/users") public ApiResult<?> search(@RequestAttribute("userId") long me,@RequestParam String query){return ApiResult.success(s.search(me,query));}
    @GetMapping("/friends") public ApiResult<?> friends(@RequestAttribute("userId") long me){return ApiResult.success(s.friendList(me));}
    @GetMapping("/followers") public ApiResult<?> followers(@RequestAttribute("userId") long me){return ApiResult.success(s.followers(me));}
    @GetMapping("/following") public ApiResult<?> following(@RequestAttribute("userId") long me){return ApiResult.success(s.following(me));}
    @GetMapping("/requests") public ApiResult<?> requests(@RequestAttribute("userId") long me){return ApiResult.success(s.requests(me));}
    @PostMapping("/requests") public ApiResult<?> sendRequest(@RequestAttribute("userId") long me,@RequestBody Name body){s.request(me,body.username());return ApiResult.success(true);}
    @PostMapping("/requests/{id}/decision") public ApiResult<?> decide(@RequestAttribute("userId") long me,@PathVariable long id,@RequestBody Decision d){s.decide(me,id,d.accept());return ApiResult.success(true);}
    @PostMapping("/requests/{id}/cancel") public ApiResult<?> cancel(@RequestAttribute("userId") long me,@PathVariable long id){s.cancel(me,id);return ApiResult.success(true);}
    @DeleteMapping("/friends/{other}") public ApiResult<?> remove(@RequestAttribute("userId") long me,@PathVariable long other){s.unfriend(me,other);return ApiResult.success(true);}
    @GetMapping("/notifications") public ApiResult<?> notifications(@RequestAttribute("userId") long me,@RequestParam(defaultValue="1") int page){return ApiResult.success(s.notifications(me,page));}
    @PostMapping("/notifications/read") public ApiResult<?> readNotifications(@RequestAttribute("userId") long me){s.readNotifications(me);return ApiResult.success(true);}
    @GetMapping("/counts") public ApiResult<?> counts(@RequestAttribute("userId") long me){var counts=new LinkedHashMap<>(s.counts(me));counts.merge("messages",groups.unread(me),Long::sum);return ApiResult.success(counts);}
    @GetMapping("/conversations") public ApiResult<?> conversations(@RequestAttribute("userId") long me){var rows=new ArrayList<Map<String,Object>>();
        for(var c:s.conversations(me)){var item=new LinkedHashMap<>(c);item.put("type","PRIVATE");rows.add(item);}
        rows.addAll(groups.conversations(me));
        rows.sort(Comparator.comparing((Map<String,Object> c)->String.valueOf(c.get("updatedAt"))).reversed());
        return ApiResult.success(rows);}
    @GetMapping("/conversations/{other}/messages") public ApiResult<?> messages(@RequestAttribute("userId") long me,@PathVariable long other,@RequestParam(defaultValue="0") long before){return ApiResult.success(s.messages(me,other,before));}
    @PostMapping("/conversations/{other}/messages") public ApiResult<?> send(@RequestAttribute("userId") long me,@PathVariable long other,@RequestBody Message m){return ApiResult.success(s.send(me,other,m.body(),m.clientId()));}
    @PostMapping("/conversations/{other}/read") public ApiResult<?> read(@RequestAttribute("userId") long me,@PathVariable long other){s.readConversation(me,other);return ApiResult.success(true);}
}
