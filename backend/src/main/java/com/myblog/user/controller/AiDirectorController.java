package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.service.AiDirectorService;
import org.springframework.web.bind.annotation.*;

/** AI Director v1: generate a 30-second storyboard, never publishes or exports a video. */
@RestController
@RequestMapping("/api/travels/{travelId}/ai-director")
public class AiDirectorController {
    private final AiDirectorService service;
    private final com.myblog.user.service.AiDirectorDraftStore draftStore;
    public AiDirectorController(AiDirectorService service,
                                com.myblog.user.service.AiDirectorDraftStore draftStore) {
        this.service = service;
        this.draftStore = draftStore;
    }

    public static class GenerateRequest {
        private boolean useAi;
        public boolean isUseAi() { return useAi; }
        public void setUseAi(boolean useAi) { this.useAi = useAi; }
    }

    @PostMapping("/draft")
    public ApiResult<AiDirectorService.StoryboardDraft> draft(
            @PathVariable("travelId") Long travelId,
            @RequestAttribute("userId") Long userId,
            @RequestBody(required = false) GenerateRequest request) {
        return ApiResult.success("Storyboard generated",
                service.generate(userId, travelId, request != null && request.isUseAi()));
    }

    /** Load the saved 30-second storyboard; null means no cloud draft yet. */
    @GetMapping("/saved")
    public ApiResult<com.myblog.user.service.AiDirectorDraftStore.CloudDraft> loadSaved(
            @PathVariable("travelId") Long travelId,
            @RequestAttribute("userId") Long userId) {
        return ApiResult.success(draftStore.load(userId, travelId));
    }

    public static class SaveDraftRequest {
        private Integer expectedRevision;
        private AiDirectorService.StoryboardDraft draft;
        public Integer getExpectedRevision() { return expectedRevision; }
        public void setExpectedRevision(Integer value) { expectedRevision = value; }
        public AiDirectorService.StoryboardDraft getDraft() { return draft; }
        public void setDraft(AiDirectorService.StoryboardDraft value) { draft = value; }
    }

    /** Revision=0 creates the first draft, otherwise compare-and-swap. */
    @PutMapping("/saved")
    public ApiResult<com.myblog.user.service.AiDirectorDraftStore.CloudDraft> saveDraft(
            @PathVariable("travelId") Long travelId,
            @RequestAttribute("userId") Long userId,
            @RequestBody SaveDraftRequest request) {
        if (request == null) {
            throw new com.myblog.user.exception.BusinessException(400, "缺少分镜数据");
        }
        return ApiResult.success("Cloud storyboard saved",
            draftStore.save(userId, travelId, request.getExpectedRevision(), request.getDraft()));
    }

}
