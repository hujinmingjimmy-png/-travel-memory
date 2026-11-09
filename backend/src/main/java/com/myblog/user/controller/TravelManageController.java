package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.dto.CreateTravelRequest;
import com.myblog.user.service.TravelManageService;
import java.util.List;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/travels/{id}")
public class TravelManageController {

  private final TravelManageService service;

  public TravelManageController(TravelManageService service) {
    this.service = service;
  }

  @PutMapping
  public ApiResult<Boolean> update(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user,
    @RequestBody CreateTravelRequest body
  ) {
    return ApiResult.success(service.update(id, user, body));
  }

  @DeleteMapping
  public ApiResult<Boolean> delete(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user
  ) {
    return ApiResult.success(service.delete(id, user));
  }

  @PostMapping("/draft")
  public ApiResult<Boolean> draft(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user
  ) {
    return ApiResult.success(service.draft(id, user));
  }

  public record OrderRequest(List<Long> ids) {}

  @PutMapping("/media/order")
  public ApiResult<Boolean> mediaOrder(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user,
    @RequestBody OrderRequest body
  ) {
    return ApiResult.success(service.reorder(id, user, body.ids(), false));
  }

  @PutMapping("/points/order")
  public ApiResult<Boolean> pointOrder(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user,
    @RequestBody OrderRequest body
  ) {
    return ApiResult.success(service.reorder(id, user, body.ids(), true));
  }
}
