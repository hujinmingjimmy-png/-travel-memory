package com.myblog.user.service;

import com.myblog.user.dto.CreateTravelRequest;
import com.myblog.user.exception.BusinessException;
import java.nio.file.*;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.transaction.support.*;

@Service
public class TravelManageService {

  private final JdbcTemplate jdbc;
  private final Path root;

  public TravelManageService(
    JdbcTemplate jdbc,
    @Value("${travel.upload-dir:uploads/travel-media}") String dir
  ) {
    this.jdbc = jdbc;
    root = Path.of(dir).toAbsolutePath().normalize();
  }

  private void owner(long id, long user) {
    var rows = jdbc.queryForList(
      "SELECT user_id FROM travel_project WHERE id=? FOR UPDATE",
      id
    );
    if (rows.isEmpty()) throw new BusinessException(404, "旅行不存在");
    if (
      ((Number) rows.get(0).get("user_id")).longValue() != user
    ) throw new BusinessException(403, "只能管理自己的旅行");
  }

  private String text(String value, int max, boolean required) {
    String s = value == null ? null : value.trim();
    if (required && (s == null || s.isEmpty())) throw new BusinessException(
      "标题不能为空"
    );
    if (s != null && s.length() > max) throw new BusinessException(
      "文字长度超出允许范围"
    );
    return s == null || s.isEmpty() ? null : s;
  }

  private String image(String value) {
    String s = text(value, 500, false);
    if (
      s != null && !s.startsWith("/images/") && !s.startsWith("https://")
    ) throw new BusinessException("图片地址须为https地址或/images/资源路径");
    return s;
  }

  @Transactional
  public boolean update(long id, long user, CreateTravelRequest r) {
    owner(id, user);
    if (r == null) throw new BusinessException("旅行信息不能为空");
    if (
      r.getStartDate() != null &&
      r.getEndDate() != null &&
      r.getEndDate().isBefore(r.getStartDate())
    ) throw new BusinessException("结束日期不能早于开始日期");
    if (
      !Set.of("PUBLIC", "PRIVATE").contains(
        r.getVisibility() == null ? "" : r.getVisibility()
      )
    ) throw new BusinessException("可见性无效");
    jdbc.update(
      "UPDATE travel_project SET title=?,subtitle=?,description=?,start_date=?,end_date=?,visibility=?,cover_url=?,background_url=? WHERE id=?",
      text(r.getTitle(), 100, true),
      text(r.getSubtitle(), 200, false),
      text(r.getDescription(), 20000, false),
      r.getStartDate(),
      r.getEndDate(),
      r.getVisibility(),
      image(r.getCoverUrl()),
      image(r.getBackgroundUrl()),
      id
    );
    return true;
  }

  @Transactional
  public boolean draft(long id, long user) {
    owner(id, user);
    jdbc.update("UPDATE travel_project SET is_published=0 WHERE id=?", id);
    return true;
  }

  @Transactional
  public boolean delete(long id, long user) {
    owner(id, user);
    jdbc.update("DELETE FROM travel_project WHERE id=?", id);
    // 数据提交后才清理照片；文件清理失败只记录日志，不会误报数据库删除失败。
    TransactionSynchronizationManager.registerSynchronization(
      new TransactionSynchronization() {
        public void afterCommit() {
          Path directory = root.resolve(Long.toString(id)).normalize();
          if (
            !directory.startsWith(root) || Files.isSymbolicLink(directory)
          ) return;
          try {
            if (Files.isDirectory(directory)) {
              try (var files = Files.newDirectoryStream(directory)) {
                for (Path file : files) Files.deleteIfExists(file);
              }
              Files.deleteIfExists(directory);
            }
          } catch (Exception e) {
            org.slf4j.LoggerFactory.getLogger(TravelManageService.class).warn(
              "旅行照片目录清理失败: {}",
              id,
              e
            );
          }
        }
      }
    );
    return true;
  }

  @Transactional
  public boolean reorder(long id, long user, List<Long> ids, boolean points) {
    owner(id, user);
    if (
      ids == null ||
      ids.size() > 1000 ||
      ids.stream().anyMatch(Objects::isNull) ||
      new HashSet<>(ids).size() != ids.size()
    ) throw new BusinessException("排序列表无效");
    String table = points ? "travel_point" : "travel_media";
    List<Long> actual = jdbc.queryForList(
      "SELECT id FROM " + table + " WHERE travel_id=? FOR UPDATE",
      Long.class,
      id
    );
    if (
      !new HashSet<>(actual).equals(new HashSet<>(ids))
    ) throw new BusinessException(409, "列表已变化，请刷新后重试");
    for (int i = 0; i < ids.size(); i++) {
      jdbc.update(
        "UPDATE " + table + " SET sort_order=? WHERE travel_id=? AND id=?",
        i,
        id,
        ids.get(i)
      );
      if (points) jdbc.update(
        "UPDATE travel_scene SET sort_order=? WHERE travel_id=? AND point_id=?",
        i,
        id,
        ids.get(i)
      );
    }
    return true;
  }
}
