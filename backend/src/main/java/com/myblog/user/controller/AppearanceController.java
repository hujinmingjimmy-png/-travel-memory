package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.exception.BusinessException;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.core.io.FileSystemResource;
import org.springframework.http.*;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.multipart.MultipartFile;

import javax.imageio.ImageIO;
import javax.imageio.ImageReader;
import javax.imageio.stream.ImageInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.file.*;
import org.springframework.transaction.support.TransactionSynchronization;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import java.util.*;

/** Account-scoped appearance preferences. All routes require the existing JWT interceptor. */
@RestController
@RequestMapping("/api/profile/appearance")
public class AppearanceController {
    private final JdbcTemplate db;
    private final Path root;
    public AppearanceController(JdbcTemplate db,
            @Value("${profile.appearance-upload-dir:uploads/appearance}") String uploadDir) {
        this.db=db;
        root=Path.of(uploadDir).toAbsolutePath().normalize();
    }

    public record AppearanceDto(int overlayPercent, int positionX, int positionY, boolean hasOverviewImage) {}
    public record UpdateDto(Integer overlayPercent, Integer positionX, Integer positionY) {}
    private Map<String,Object> current(long id) {
        var rows=db.queryForList("SELECT overlay_percent,position_x,position_y,image_name FROM tm_user_appearance WHERE user_id=?",id);
        return rows.isEmpty()?Map.of():rows.get(0);
    }
    private AppearanceDto dto(long id) {
        Map<String,Object> row=current(id);
        if(row.isEmpty())return new AppearanceDto(15,50,50,false);
        return new AppearanceDto(((Number)row.get("overlay_percent")).intValue(),
                ((Number)row.get("position_x")).intValue(), ((Number)row.get("position_y")).intValue(),
                row.get("image_name")!=null);
    }
    private static int range(Integer value,int fallback,int max) {
        if(value==null)return fallback;
        if(value<0||value>max)throw new BusinessException("外观设置超出允许范围");
        return value;
    }
    @GetMapping public ApiResult<AppearanceDto> get(@RequestAttribute("userId") Long id){return ApiResult.success(dto(id));}
    @PutMapping @Transactional public ApiResult<AppearanceDto> update(@RequestAttribute("userId") Long id, @RequestBody UpdateDto body) {
        AppearanceDto old=dto(id);
        int alpha=range(body.overlayPercent(),old.overlayPercent(),80);
        int x=range(body.positionX(),old.positionX(),100);
        int y=range(body.positionY(),old.positionY(),100);
        db.update("INSERT INTO tm_user_appearance(user_id,overlay_percent,position_x,position_y) VALUES (?,?,?,?) " +
                "ON DUPLICATE KEY UPDATE overlay_percent=VALUES(overlay_percent),position_x=VALUES(position_x),position_y=VALUES(position_y)", id,alpha,x,y);
        return ApiResult.success(dto(id));
    }
    private Path dir(long id){return root.resolve(String.valueOf(id));}
    private Path safeImage(long id,Object name){
        if(!(name instanceof String file)||!file.matches("[0-9a-fA-F-]{36}\\.(jpg|png)"))return null;
        Path directory=dir(id).normalize();Path path=directory.resolve(file).normalize();
        return directory.startsWith(root)&&path.startsWith(directory)?path:null;
    }
    private static void deleteAfterCommit(Path file) {
        if(file==null)return;
        TransactionSynchronizationManager.registerSynchronization(new TransactionSynchronization() {
            @Override public void afterCommit() {
                try {Files.deleteIfExists(file);}catch(IOException ignored) { /* logged by disk monitoring */ }
            }
        });
    }
    private record Picture(String extension,String mime){}
    private Picture inspect(MultipartFile file)throws IOException {
        if(file==null||file.isEmpty()||file.getSize()>8L*1024*1024)throw new BusinessException("背景图片必须在 8MB 以内");
        try(InputStream in=file.getInputStream();ImageInputStream imageIn=ImageIO.createImageInputStream(in)) {
            if(imageIn==null)throw new BusinessException("无效的背景图片");
            Iterator<ImageReader> readers=ImageIO.getImageReaders(imageIn);
            if(!readers.hasNext())throw new BusinessException("仅支持 JPEG 或 PNG 图片");
            ImageReader reader=readers.next();
            try {
                reader.setInput(imageIn,true,true);
                int w=reader.getWidth(0),h=reader.getHeight(0);
                if(w<200||h<100||w>10000||h>10000||((long)w*h)>45_000_000L)
                    throw new BusinessException("背景图片尺寸不支持");
                String format=reader.getFormatName().toLowerCase(Locale.ROOT);
                if(format.contains("jpeg")||format.equals("jpg"))return new Picture("jpg","image/jpeg");
                if(format.equals("png"))return new Picture("png","image/png");
                throw new BusinessException("仅支持 JPEG 或 PNG 图片");
            }finally{reader.dispose();}
        }
    }
    @PostMapping(value="/image",consumes=MediaType.MULTIPART_FORM_DATA_VALUE)
    @Transactional
    public ApiResult<AppearanceDto> upload(@RequestAttribute("userId")Long id,@RequestParam("file")MultipartFile file) throws IOException {
        Picture picture=inspect(file);
        String fresh=UUID.randomUUID()+"."+picture.extension();
        Path directory=dir(id);Files.createDirectories(directory);
        Path destination=directory.resolve(fresh);
        Path old=safeImage(id,current(id).get("image_name"));
        try(InputStream in=file.getInputStream()) {Files.copy(in,destination);}
        try {
            db.update("INSERT INTO tm_user_appearance(user_id,image_name) VALUES (?,?) " +
                    "ON DUPLICATE KEY UPDATE image_name=VALUES(image_name)",id,fresh);
        } catch(RuntimeException e){Files.deleteIfExists(destination);throw e;}
        deleteAfterCommit(old);
        return ApiResult.success(dto(id));
    }
    @DeleteMapping("/image") @Transactional public ApiResult<AppearanceDto> remove(@RequestAttribute("userId")Long id) {
        Path old=safeImage(id,current(id).get("image_name"));
        db.update("UPDATE tm_user_appearance SET image_name=NULL WHERE user_id=?",id);
        deleteAfterCommit(old);
        return ApiResult.success(dto(id));
    }
    @GetMapping("/image") public ResponseEntity<FileSystemResource> image(@RequestAttribute("userId")Long id) {
        Path file=safeImage(id,current(id).get("image_name"));
        if(file==null||!Files.isRegularFile(file))throw new BusinessException(404,"未设置概览背景图片");
        try {
            String mime=file.toString().endsWith(".png")?"image/png":"image/jpeg";
            return ResponseEntity.ok().contentType(MediaType.parseMediaType(mime)).contentLength(Files.size(file))
                    .cacheControl(CacheControl.noStore()).header("X-Content-Type-Options","nosniff").body(new FileSystemResource(file));
        }catch(IOException e){throw new BusinessException(404,"背景图片读取失败");}
    }
}
