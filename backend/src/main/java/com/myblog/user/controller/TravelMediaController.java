package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.TravelMediaService;
import com.myblog.user.vo.TravelMediaVO;
import org.springframework.core.io.Resource;
import org.springframework.http.CacheControl;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

/** 所有 /api/** 请求依然经过上一阶段 AuthInterceptor 的 JWT 校验。 */
@RestController
@RequestMapping("/api/travels/{travelId}/media")
public class TravelMediaController {
    private final TravelMediaService service;

    public TravelMediaController(TravelMediaService service) {
        this.service = service;
    }

    /** 获取有权查看的旅行照片列表。 */
    @GetMapping
    public ApiResult<List<TravelMediaVO>> list(
            @RequestAttribute("userId") Long userId,
            @PathVariable("travelId") Long travelId) {
        return ApiResult.success(service.list(userId, travelId));
    }

    /** 仅旅行创建者可一次上传多张照片（参数名 files）。 */
    @PostMapping(consumes = MediaType.MULTIPART_FORM_DATA_VALUE)
    public ApiResult<List<TravelMediaVO>> upload(
            @RequestAttribute("userId") Long userId,
            @PathVariable("travelId") Long travelId,
            @RequestParam("files") List<MultipartFile> files) {
        return ApiResult.success("上传成功", service.upload(userId, travelId, files));
    }

    /** 经权限校验后返回真实图片流，私密旅行不能被猜 URL 直接访问。 */
    @GetMapping("/{mediaId}/file")
    public ResponseEntity<Resource> file(
            @RequestAttribute("userId") Long userId,
            @PathVariable("travelId") Long travelId,
            @PathVariable("mediaId") Long mediaId) {
        TravelMediaService.MediaResource media = service.read(userId, travelId, mediaId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType(media.mimeType()))
                .contentLength(media.size())
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(media.resource());
    }

    /** 删除照片；只有旅行创建者能操作。 */
    @DeleteMapping("/{mediaId}")
    public ApiResult<Boolean> delete(
            @RequestAttribute("userId") Long userId,
            @PathVariable("travelId") Long travelId,
            @PathVariable("mediaId") Long mediaId) {
        service.delete(userId, travelId, mediaId);
        return ApiResult.success("删除成功", true);
    }
}
