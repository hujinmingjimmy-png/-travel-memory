package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.AiDirectorPublicShareService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.util.List;

/** Authenticated owner controls. All publications are PRIVATE until explicitly published. */
@RestController
@RequestMapping("/api/travels/{travelId}/ai-director/library")
public class AiDirectorPublicShareController {
    private final AiDirectorPublicShareService shares;
    public AiDirectorPublicShareController(AiDirectorPublicShareService shares) { this.shares = shares; }

    @GetMapping("/publications")
    public ApiResult<List<AiDirectorPublicShareService.Publication>> list(
            @RequestAttribute("userId") Long userId, @PathVariable Long travelId) {
        return ApiResult.success(shares.list(userId, travelId));
    }

    @PostMapping("/works/{workId}/publish")
    public ApiResult<AiDirectorPublicShareService.Publication> publish(
            @RequestAttribute("userId") Long userId, @PathVariable Long travelId, @PathVariable String workId) {
        return ApiResult.success(shares.publish(userId, travelId, workId));
    }

    @DeleteMapping("/works/{workId}/publish")
    public ApiResult<AiDirectorPublicShareService.Publication> revoke(
            @RequestAttribute("userId") Long userId, @PathVariable Long travelId, @PathVariable String workId) {
        return ApiResult.success(shares.revoke(userId, travelId, workId));
    }
}

