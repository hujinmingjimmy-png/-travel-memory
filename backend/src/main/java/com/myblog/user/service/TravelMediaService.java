package com.myblog.user.service;

import com.myblog.user.vo.TravelMediaVO;
import org.springframework.core.io.Resource;
import org.springframework.web.multipart.MultipartFile;

import java.util.List;

public interface TravelMediaService {
    List<TravelMediaVO> list(Long userId, Long travelId);
    List<TravelMediaVO> upload(Long userId, Long travelId, List<MultipartFile> files);
    MediaResource read(Long userId, Long travelId, Long mediaId);
    void delete(Long userId, Long travelId, Long mediaId);

    /** 后端鉴权成功才允许返回文件流，不依赖公开 static 目录。 */
    record MediaResource(Resource resource, String mimeType, long size) {}
}
