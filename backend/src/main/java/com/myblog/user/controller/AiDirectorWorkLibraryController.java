package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.AiDirectorWorkLibraryService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;

import java.nio.file.Files;
import java.nio.file.Path;
import java.util.List;

/** Private works library; no unauthenticated or public share endpoint in v6. */
@RestController
@RequestMapping("/api/travels/{travelId}/ai-director/library")
public class AiDirectorWorkLibraryController {
    private final AiDirectorWorkLibraryService works;

    public AiDirectorWorkLibraryController(AiDirectorWorkLibraryService works) {
        this.works = works;
    }

    public record SaveRequest(String jobId, String title) {}

    @PostMapping("/works")
    public ApiResult<AiDirectorWorkLibraryService.WorkInfo> save(
            @RequestAttribute("userId") Long userId,
            @PathVariable Long travelId,
            @RequestBody SaveRequest request) {
        if (request == null) throw new com.myblog.user.exception.BusinessException(400, "缺少作品信息");
        return ApiResult.success(works.save(userId, travelId, request.jobId(), request.title()));
    }

    @GetMapping("/works")
    public ApiResult<List<AiDirectorWorkLibraryService.WorkInfo>> list(
            @RequestAttribute("userId") Long userId, @PathVariable Long travelId) {
        return ApiResult.success(works.list(userId, travelId));
    }

    @GetMapping("/works/{workId}/file")
    public ResponseEntity<FileSystemResource> download(
            @RequestAttribute("userId") Long userId,
            @PathVariable Long travelId,
            @PathVariable String workId) throws Exception {
        Path file = works.download(userId, travelId, workId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("video/mp4"))
                .contentLength(Files.size(file))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=travel-memory-work.mp4")
                .header("X-Content-Type-Options", "nosniff")
                .cacheControl(CacheControl.noStore())
                .body(new FileSystemResource(file));
    }

    @DeleteMapping("/works/{workId}")
    public ApiResult<Boolean> delete(
            @RequestAttribute("userId") Long userId,
            @PathVariable Long travelId,
            @PathVariable String workId) {
        works.delete(userId, travelId, workId);
        return ApiResult.success(true);
    }
}
