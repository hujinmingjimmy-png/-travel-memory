package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.JourneyGroupService;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/social-hub/travel-groups")
public class JourneyGroupController {
    private final JourneyGroupService groups;
    public JourneyGroupController(JourneyGroupService groups){this.groups=groups;}
    public record Invite(long userId){}
    public record Decision(long version,boolean accept){}
    public record Message(String body,String clientId){}
    public record ReadPosition(long through){}
    @GetMapping("/invitations") public ApiResult<?> invitations(@RequestAttribute("userId") long me){return ApiResult.success(groups.invitations(me));}
    @GetMapping("/{trip}/members") public ApiResult<?> members(@RequestAttribute("userId") long me,@PathVariable long trip){return ApiResult.success(groups.members(me,trip));}
    @PostMapping("/{trip}/join") public ApiResult<?> join(@RequestAttribute("userId") long me,@PathVariable long trip){groups.joinOwner(me,trip);return ApiResult.success(true);}
    @PostMapping("/{trip}/invitations") public ApiResult<?> invite(@RequestAttribute("userId") long me,@PathVariable long trip,@RequestBody Invite body){groups.invite(me,trip,body.userId());return ApiResult.success(true);}
    @PostMapping("/{trip}/decision") public ApiResult<?> decide(@RequestAttribute("userId") long me,@PathVariable long trip,@RequestBody Decision body){groups.decide(me,trip,body.version(),body.accept());return ApiResult.success(true);}
    @PostMapping("/{trip}/leave") public ApiResult<?> leave(@RequestAttribute("userId") long me,@PathVariable long trip){groups.leave(me,trip);return ApiResult.success(true);}
    @DeleteMapping("/{trip}/members/{user}") public ApiResult<?> remove(@RequestAttribute("userId") long me,@PathVariable long trip,@PathVariable long user){groups.remove(me,trip,user);return ApiResult.success(true);}
    @GetMapping("/{trip}/messages") public ApiResult<?> chat(@RequestAttribute("userId") long me,@PathVariable long trip,@RequestParam(defaultValue="0") long before){return ApiResult.success(groups.chat(me,trip,before));}
    @PostMapping("/{trip}/messages") public ApiResult<?> send(@RequestAttribute("userId") long me,@PathVariable long trip,@RequestBody Message body){return ApiResult.success(groups.send(me,trip,body.body(),body.clientId()));}
    @PostMapping("/{trip}/read") public ApiResult<?> read(@RequestAttribute("userId") long me,@PathVariable long trip,@RequestBody ReadPosition body){groups.read(me,trip,body.through());return ApiResult.success(true);}
}
