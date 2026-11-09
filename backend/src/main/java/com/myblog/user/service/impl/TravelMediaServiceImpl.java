package com.myblog.user.service.impl;

import com.baomidou.mybatisplus.core.conditions.query.LambdaQueryWrapper;
import com.myblog.user.entity.TravelMedia;
import com.myblog.user.entity.TravelProject;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.mapper.TravelMediaMapper;
import com.myblog.user.mapper.TravelProjectMapper;
import com.myblog.user.service.TravelMediaService;
import com.myblog.user.vo.TravelMediaVO;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.web.multipart.MultipartFile;

import java.io.IOException;
import java.io.InputStream;
import java.nio.file.Files;
import java.nio.file.Path;
import java.nio.file.StandardCopyOption;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.List;
import java.util.UUID;

/**
 * 旅行图片业务：
 * 1. 上传多张照片（存磁盘）
 * 2. 将元数据保存在 MySQL travel_media
 * 3. 阅读/下载/删除时检查旅行归属或 PUBLIC + 已发布
 *
 * ★★★★★【图片真正保存的位置】★★★★★
 * application.yml 下新增 travel.upload-dir 配置。
 * 默认路径是 Spring Boot 启动目录下的 uploads/travel-media。
 */
@Service
public class TravelMediaServiceImpl implements TravelMediaService {

    private static final long MAX_FILE_SIZE = 8L * 1024 * 1024;
    private static final int MAX_FILES_PER_UPLOAD = 8;
    private static final int MAX_FILES_PER_TRAVEL = 100;

    private final TravelMediaMapper mediaMapper;
    private final TravelProjectMapper travelMapper;
    private final Path uploadRoot;
    private final org.springframework.jdbc.core.JdbcTemplate db;

    public TravelMediaServiceImpl(
            TravelMediaMapper mediaMapper,
            TravelProjectMapper travelMapper, org.springframework.jdbc.core.JdbcTemplate db,
            @Value("${travel.upload-dir:uploads/travel-media}") String uploadDir) {
        this.mediaMapper = mediaMapper;this.db=db;
        this.travelMapper = travelMapper;
        this.uploadRoot = Path.of(uploadDir).toAbsolutePath().normalize();
    }

    @Override
    public List<TravelMediaVO> list(Long userId, Long travelId) {
        TravelProject travel = requireTravel(travelId);
        requireReadable(travel, userId);
        return listEntities(travelId).stream().map(this::toVO).toList();
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public List<TravelMediaVO> upload(Long userId, Long travelId, List<MultipartFile> files) {
        TravelProject travel = requireTravel(travelId);
        requireOwner(travel, userId);

        if (files == null || files.isEmpty() || files.size() > MAX_FILES_PER_UPLOAD) {
            throw new BusinessException("一次请上传 1～8 张图片");
        }

        Long existingCount = mediaMapper.selectCount(
                new LambdaQueryWrapper<TravelMedia>().eq(TravelMedia::getTravelId, travelId));
        if (existingCount + files.size() > MAX_FILES_PER_TRAVEL) {
            throw new BusinessException("每段旅行最多保存 100 张图片");
        }

        // 先验证所有文件，避免第 3 张出错时前 2 张已经写入。
        List<String> types = new ArrayList<>();
        for (MultipartFile file : files) {
            if (file == null || file.isEmpty() || file.getSize() > MAX_FILE_SIZE) {
                throw new BusinessException("单张照片大小必须为 0～8MB（不含 0）");
            }
            types.add(detectMimeType(file));
        }

        Path directory = uploadRoot.resolve(String.valueOf(travelId)).normalize();
        List<Path> savedPaths = new ArrayList<>();
        List<TravelMediaVO> result = new ArrayList<>();
        int nextOrder = listEntities(travelId).stream()
                .mapToInt(item -> item.getSortOrder() == null ? 0 : item.getSortOrder())
                .max().orElse(-1) + 1;

        try {
            Files.createDirectories(directory);

            for (int i = 0; i < files.size(); i++) {
                MultipartFile file = files.get(i);
                String mime = types.get(i);
                String extension = extensionOf(mime);

                // 永远不用用户上传的原文件名作为磁盘文件名。
                String safeFileName = UUID.randomUUID() + "." + extension;
                Path destination = directory.resolve(safeFileName).normalize();
                if (!destination.startsWith(directory)) {
                    throw new BusinessException("非法文件路径");
                }

                try (InputStream stream = file.getInputStream()) {
                    Files.copy(stream, destination, StandardCopyOption.REPLACE_EXISTING);
                }
                savedPaths.add(destination);

                TravelMedia entity = new TravelMedia();
                entity.setTravelId(travelId);
                entity.setFileName(safeFileName);
                entity.setOriginalName(cleanOriginalName(file.getOriginalFilename()));
                entity.setMimeType(mime);
                entity.setFileSize(file.getSize());
                entity.setSortOrder(nextOrder++);
                mediaMapper.insert(entity);
                result.add(toVO(entity));
            }
            return result;
        } catch (IOException | RuntimeException ex) {
            // 发生 DB/IO 异常时清理本批次已经写入磁盘的图片。
            for (Path saved : savedPaths) {
                try { Files.deleteIfExists(saved); } catch (IOException ignored) { }
            }
            if (ex instanceof RuntimeException runtimeException) {
                throw runtimeException;
            }
            throw new IllegalStateException("保存照片失败，请检查磁盘目录是否可写", ex);
        }
    }

    @Override
    public MediaResource read(Long userId, Long travelId, Long mediaId) {
        TravelProject travel = requireTravel(travelId);
        requireReadable(travel, userId);
        TravelMedia media = requireMedia(travelId, mediaId);
        Path path = filePath(travelId, media.getFileName());
        try {
            if (!Files.isRegularFile(path)) {
                throw new BusinessException(404, "图片文件不存在");
            }
            return new MediaResource(new FileSystemResource(path),
                    media.getMimeType(), Files.size(path));
        } catch (IOException e) {
            throw new IllegalStateException("读取照片失败", e);
        }
    }

    @Override
    @Transactional(rollbackFor = Exception.class)
    public void delete(Long userId, Long travelId, Long mediaId) {
        db.queryForList("SELECT id FROM travel_project WHERE id=? FOR UPDATE",travelId);
        TravelProject travel = requireTravel(travelId);
        requireOwner(travel, userId);
        Long references=db.queryForObject("SELECT COUNT(*) FROM tm_journey_contribution WHERE travel_id=? AND source_media_id=?",Long.class,travelId,mediaId);
        if(references!=null&&references>0)throw new BusinessException(409,"这张照片已加入共同作品，请先移除共同作品后再删除原照片");
        TravelMedia media = requireMedia(travelId, mediaId);
        Path diskFile = filePath(travelId, media.getFileName());

        mediaMapper.deleteById(mediaId);

        /*
         * 健康修复：
         * 先提交数据库事务，再删除磁盘文件。
         *
         * 否则如果数据库提交失败但文件已经被删，
         * 就会出现“数据库记录还在、照片文件没了”的不一致。
         */
        TransactionSynchronizationManager.registerSynchronization(
                new TransactionSynchronization() {
                    @Override
                    public void afterCommit() {
                        try {
                            Files.deleteIfExists(diskFile);
                        } catch (IOException e) {
                            org.slf4j.LoggerFactory
                                    .getLogger(TravelMediaServiceImpl.class)
                                    .warn(
                                            "删除图片文件失败，待人工清理：travelId={}, mediaId={}",
                                            travelId,
                                            mediaId,
                                            e
                                    );
                        }
                    }
                }
        );
    }

    private TravelProject requireTravel(Long travelId) {
        if (travelId == null) throw new BusinessException("旅行 ID 不能为空");
        TravelProject travel = travelMapper.selectById(travelId);
        if (travel == null) throw new BusinessException(404, "旅行不存在");
        return travel;
    }

    private void requireOwner(TravelProject travel, Long userId) {
        if (userId == null || !userId.equals(travel.getUserId())) {
            throw new BusinessException(403, "只能管理自己旅行中的照片");
        }
    }

    private void requireReadable(TravelProject travel, Long userId) {
        boolean isOwner = userId != null && userId.equals(travel.getUserId());
        boolean isPublishedPublic = "PUBLIC".equals(travel.getVisibility())
                && Integer.valueOf(1).equals(travel.getIsPublished());
        if (!isOwner && !isPublishedPublic) {
            throw new BusinessException(403, "这段旅行的照片尚未公开");
        }
    }

    private TravelMedia requireMedia(Long travelId, Long mediaId) {
        if (mediaId == null) throw new BusinessException("照片 ID 不能为空");
        TravelMedia media = mediaMapper.selectById(mediaId);
        if (media == null || !travelId.equals(media.getTravelId())) {
            throw new BusinessException(404, "照片不存在");
        }
        return media;
    }

    private List<TravelMedia> listEntities(Long travelId) {
        return mediaMapper.selectList(new LambdaQueryWrapper<TravelMedia>()
                .eq(TravelMedia::getTravelId, travelId)
                .orderByAsc(TravelMedia::getSortOrder)
                .orderByAsc(TravelMedia::getId));
    }

    private Path filePath(Long travelId, String fileName) {
        // 数据库中的文件名同样进行白名单校验，防路径穿越。
        if (fileName == null || !fileName.matches("[0-9a-fA-F-]{36}\\.(jpg|png|webp)")) {
            throw new BusinessException(400, "文件名无效");
        }
        Path directory = uploadRoot.resolve(String.valueOf(travelId)).normalize();
        Path path = directory.resolve(fileName).normalize();
        if (!path.startsWith(directory)) throw new BusinessException("非法文件路径");
        return path;
    }

    private String detectMimeType(MultipartFile file) {
        byte[] header = new byte[12];
        try (InputStream input = file.getInputStream()) {
            int count = 0;
            while (count < header.length) {
                int read = input.read(header, count, header.length - count);
                if (read < 0) break;
                count += read;
            }
            if (count >= 3 && (header[0] & 0xFF) == 0xFF
                    && (header[1] & 0xFF) == 0xD8 && (header[2] & 0xFF) == 0xFF) {
                return "image/jpeg";
            }
            if (count >= 8 && Arrays.equals(Arrays.copyOf(header, 8),
                    new byte[]{(byte) 0x89, 0x50, 0x4E, 0x47, 0x0D, 0x0A, 0x1A, 0x0A})) {
                return "image/png";
            }
            if (count >= 12 && new String(header, 0, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("RIFF")
                    && new String(header, 8, 4, java.nio.charset.StandardCharsets.US_ASCII).equals("WEBP")) {
                return "image/webp";
            }
        } catch (IOException e) {
            throw new IllegalStateException("读取上传图片失败", e);
        }
        throw new BusinessException("只支持 JPG、PNG、WEBP 图片");
    }

    private String extensionOf(String mime) {
        return switch (mime) {
            case "image/jpeg" -> "jpg";
            case "image/png" -> "png";
            case "image/webp" -> "webp";
            default -> throw new BusinessException("不支持的图片格式");
        };
    }

    private String cleanOriginalName(String original) {
        if (original == null) return null;
        String normalized = original.replace('\\', '/');
        String name = normalized.substring(normalized.lastIndexOf('/') + 1)
                .replaceAll("[\\p{Cntrl}]", "").trim();
        return name.length() > 255 ? name.substring(0, 255) : name;
    }

    private TravelMediaVO toVO(TravelMedia media) {
        TravelMediaVO vo = new TravelMediaVO();
        vo.setId(media.getId());
        vo.setTravelId(media.getTravelId());
        vo.setOriginalName(media.getOriginalName());
        vo.setMimeType(media.getMimeType());
        vo.setFileSize(media.getFileSize());
        vo.setCaption(media.getCaption());
        vo.setSortOrder(media.getSortOrder());
        vo.setCreatedAt(media.getCreatedAt());
        return vo;
    }
}
