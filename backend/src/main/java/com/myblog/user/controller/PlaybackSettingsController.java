package com.myblog.user.controller;

import com.myblog.user.common.ApiResult;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.service.TravelProjectService;
import java.util.Set;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.bind.annotation.*;

@RestController
@RequestMapping("/api/travels/{id}/immersive/settings")
public class PlaybackSettingsController {

  private final JdbcTemplate jdbc;
  private final TravelProjectService projects;

  public PlaybackSettingsController(
    JdbcTemplate jdbc,
    TravelProjectService projects
  ) {
    this.jdbc = jdbc;
    this.projects = projects;
  }

  public record Settings(
    String transition,
    String musicUrl,
    double volume,
    boolean mapEnabled,
    boolean fullOnStart
  ) {}

  @GetMapping
  public ApiResult<Settings> get(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user
  ) {
    projects.getTravelDetail(user, id);
    var rows = jdbc.query(
      "SELECT transition,music_url,volume,map_enabled,full_on_start FROM travel_playback WHERE travel_id=?",
      (rs, n) ->
        new Settings(
          rs.getString(1),
          rs.getString(2),
          rs.getDouble(3),
          rs.getBoolean(4),
          rs.getBoolean(5)
        ),
      id
    );
    return ApiResult.success(
      rows.isEmpty() ? new Settings("fade", "", .35, true, true) : rows.get(0)
    );
  }

  @PutMapping
  @Transactional
  public ApiResult<Boolean> save(
    @PathVariable("id") long id,
    @RequestAttribute("userId") long user,
    @RequestBody Settings s
  ) {
    var rows = jdbc.queryForList(
      "SELECT user_id FROM travel_project WHERE id=? FOR UPDATE",
      id
    );
    if (rows.isEmpty()) throw new BusinessException(404, "旅行不存在");
    if (
      ((Number) rows.get(0).get("user_id")).longValue() != user
    ) throw new BusinessException(403, "只能设置自己的旅行");
    if (
      s.transition() == null ||
      !Set.of("fade", "slide", "zoom").contains(s.transition()) ||
      !Double.isFinite(s.volume()) ||
      s.volume() < 0 ||
      s.volume() > 1
    ) throw new BusinessException("播放设置无效");
    String music = s.musicUrl() == null ? "" : s.musicUrl().trim();
    if (
      music.length() > 500 ||
      (!music.isEmpty() &&
        !music.startsWith("https://") &&
        !music.startsWith("/audio/"))
    ) throw new BusinessException("音乐地址须为https或/audio/资源路径");
    jdbc.update(
      "INSERT INTO travel_playback(travel_id,transition,music_url,volume,map_enabled,full_on_start) VALUES(?,?,?,?,?,?) ON DUPLICATE KEY UPDATE transition=VALUES(transition),music_url=VALUES(music_url),volume=VALUES(volume),map_enabled=VALUES(map_enabled),full_on_start=VALUES(full_on_start)",
      id,
      s.transition(),
      music,
      s.volume(),
      s.mapEnabled(),
      s.fullOnStart()
    );
    return ApiResult.success(true);
  }
}
