package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.SocialService;
import java.util.*;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api")
public class SocialController {

  private final SocialService service;

  public SocialController(SocialService service) {
    this.service = service;
  }

  @GetMapping("/travels/{id}/social")
  public ApiResult<Map<String, Object>> state(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user
  ) {
    return ApiResult.success(service.state(id, user));
  }

  @PutMapping("/travels/{id}/like")
  public ApiResult<Map<String, Object>> like(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user
  ) {
    return ApiResult.success(service.like(id, user, true));
  }

  @DeleteMapping("/travels/{id}/like")
  public ApiResult<Map<String, Object>> unlike(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user
  ) {
    return ApiResult.success(service.like(id, user, false));
  }

  @PutMapping("/users/{id}/follow")
  public ApiResult<Boolean> follow(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user
  ) {
    return ApiResult.success(service.follow(id, user, true));
  }

  @DeleteMapping("/users/{id}/follow")
  public ApiResult<Boolean> unfollow(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user
  ) {
    return ApiResult.success(service.follow(id, user, false));
  }

  @GetMapping("/travels/{id}/comments")
  public ApiResult<List<Map<String, Object>>> comments(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user,
    @RequestParam(value = "page", defaultValue = "1") int page
  ) {
    return ApiResult.success(service.comments(id, user, page));
  }

  public record CommentRequest(String content) {}

  @PostMapping("/travels/{id}/comments")
  public ApiResult<Boolean> comment(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user,
    @RequestBody CommentRequest body
  ) {
    return ApiResult.success(service.comment(id, user, body.content()));
  }

  @DeleteMapping("/travels/{id}/comments/{commentId}")
  public ApiResult<Boolean> remove(
    @PathVariable("id") long id,
    @PathVariable("commentId") long commentId,
    @RequestAttribute("userId") long user
  ) {
    return ApiResult.success(service.deleteComment(id, commentId, user));
  }
}
