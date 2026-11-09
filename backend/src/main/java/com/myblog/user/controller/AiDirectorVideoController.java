package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.AiDirectorService;
import com.myblog.user.service.AiDirectorVideoService;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.CacheControl;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.*;
import java.nio.file.Path;

/** Authenticated video export API. No public link or unauthenticated file route. */
@RestController
@RequestMapping("/api/travels/{travelId}/ai-director/video")
public class AiDirectorVideoController {
    private final AiDirectorVideoService videos;
    public AiDirectorVideoController(AiDirectorVideoService videos) { this.videos = videos; }

    @PostMapping("/jobs")
    public ApiResult<AiDirectorVideoService.JobState> start(
            @RequestAttribute("userId") Long userId,
            @PathVariable("travelId") Long travelId,
            @RequestBody AiDirectorService.StoryboardDraft draft) {
        return ApiResult.success(videos.start(userId, travelId, draft));
    }

    /** Narrated MP4 is opt-in; existing silent endpoint remains unchanged. */
    public record VoiceVideoRequest(AiDirectorService.StoryboardDraft draft, boolean voiceover, String voice) {}

    @PostMapping("/jobs/voice")
    public ApiResult<AiDirectorVideoService.JobState> startVoice(
            @RequestAttribute("userId") Long userId,
            @PathVariable("travelId") Long travelId,
            @RequestBody VoiceVideoRequest request) {
        if (request == null || !request.voiceover()) {
            throw new com.myblog.user.exception.BusinessException(400, "请先确认启用 AI 旁白");
        }
        return ApiResult.success(videos.start(userId, travelId, request.draft(), true, request.voice()));
    }

    @GetMapping("/jobs/{jobId}")
    public ApiResult<AiDirectorVideoService.JobState> status(
            @RequestAttribute("userId") Long userId,
            @PathVariable("travelId") Long travelId,
            @PathVariable("jobId") String jobId) {
        return ApiResult.success(videos.state(userId, travelId, jobId));
    }

    @GetMapping("/jobs/{jobId}/file")
    public ResponseEntity<FileSystemResource> download(
            @RequestAttribute("userId") Long userId,
            @PathVariable("travelId") Long travelId,
            @PathVariable("jobId") String jobId) throws Exception {
        Path file = videos.video(userId, travelId, jobId);
        return ResponseEntity.ok()
                .contentType(MediaType.parseMediaType("video/mp4"))
                .contentLength(java.nio.file.Files.size(file))
                .header(HttpHeaders.CONTENT_DISPOSITION, "attachment; filename=travel-memory-30s.mp4")
                .cacheControl(CacheControl.noStore())
                .header("X-Content-Type-Options", "nosniff")
                .body(new FileSystemResource(file));
    }
}
