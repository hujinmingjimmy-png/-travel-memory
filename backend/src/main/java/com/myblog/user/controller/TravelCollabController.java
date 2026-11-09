package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.TravelCollabService;
import org.springframework.web.bind.annotation.*;
import java.util.List;
import java.util.Map;

@RestController
@RequestMapping("/api/collab")
public class TravelCollabController {
    private final TravelCollabService service;
    public TravelCollabController(TravelCollabService service) { this.service = service; }

    public record InviteRequest(String username) {}
    public record DecisionRequest(String decision) {}

    @GetMapping("/my-travels")
    public ApiResult<List<Map<String,Object>>> myTravels(@RequestAttribute("userId") Long userId) {
        return ApiResult.success(service.myTravels(userId));
    }

    @GetMapping("/inbox")
    public ApiResult<List<Map<String,Object>>> inbox(@RequestAttribute("userId") Long userId) {
        return ApiResult.success(service.inbox(userId));
    }

    @GetMapping("/travels/{id}/invites")
    public ApiResult<List<Map<String,Object>>> invites(@RequestAttribute("userId") Long userId,
                                                       @PathVariable("id") Long travelId) {
        return ApiResult.success(service.sentInvites(userId, travelId));
    }

    @PostMapping("/travels/{id}/invite")
    public ApiResult<Boolean> invite(@RequestAttribute("userId") Long userId,
                                     @PathVariable("id") Long travelId,
                                     @RequestBody InviteRequest body) {
        service.invite(userId, travelId, body == null ? null : body.username());
        return ApiResult.success("邀请已发送", true);
    }

    @PostMapping("/invites/{id}/decision")
    public ApiResult<Boolean> decide(@RequestAttribute("userId") Long userId,
                                     @PathVariable("id") Long inviteId,
                                     @RequestBody DecisionRequest body) {
        service.decide(userId, inviteId, body == null ? null : body.decision());
        return ApiResult.success(true);
    }

    @PostMapping("/invites/{id}/cancel")
    public ApiResult<Boolean> cancel(@RequestAttribute("userId") Long userId,
                                     @PathVariable("id") Long inviteId) {
        service.cancel(userId, inviteId);
        return ApiResult.success(true);
    }

    @DeleteMapping("/travels/{id}/members/{memberId}")
    public ApiResult<Boolean> remove(@RequestAttribute("userId") Long userId,
                                     @PathVariable("id") Long travelId,
                                     @PathVariable("memberId") Long memberId) {
        service.removeMember(userId, travelId, memberId);
        return ApiResult.success(true);
    }

    @PostMapping("/travels/{id}/leave")
    public ApiResult<Boolean> leave(@RequestAttribute("userId") Long userId,
                                    @PathVariable("id") Long travelId) {
        service.leave(userId, travelId);
        return ApiResult.success(true);
    }

    @GetMapping("/travels/{id}/preview")
    public ApiResult<Map<String,Object>> preview(@RequestAttribute("userId") Long userId,
                                                 @PathVariable("id") Long travelId) {
        return ApiResult.success(service.preview(userId, travelId));
    }
}
