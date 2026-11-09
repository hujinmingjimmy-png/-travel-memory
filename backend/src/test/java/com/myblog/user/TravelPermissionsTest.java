package com.myblog.user;

import static org.junit.jupiter.api.Assertions.*;
import static org.mockito.Mockito.*;

import com.myblog.user.dto.CreateTravelRequest;
import com.myblog.user.exception.BusinessException;
import com.myblog.user.service.*;
import java.util.*;
import org.junit.jupiter.api.*;
import org.springframework.jdbc.core.JdbcTemplate;

class TravelPermissionsTest {

  JdbcTemplate jdbc;
  TravelManageService manage;
  SocialService social;

  @BeforeEach
  void setup() {
    jdbc = mock(JdbcTemplate.class);
    manage = new TravelManageService(jdbc, "test-uploads");
    social = new SocialService(jdbc, mock(SocialHubService.class));
  }

  void owner(long uid) {
    when(
      jdbc.queryForList(
        "SELECT user_id FROM travel_project WHERE id=? FOR UPDATE",
        1L
      )
    ).thenReturn(List.of(Map.of("user_id", uid)));
  }

  void travel(String visibility, int published, long owner, boolean lock) {
    when(
      jdbc.queryForList(
        "SELECT user_id,visibility,is_published FROM travel_project WHERE id=?" +
          (lock ? " FOR UPDATE" : ""),
        1L
      )
    ).thenReturn(
      List.of(
        Map.of(
          "user_id",
          owner,
          "visibility",
          visibility,
          "is_published",
          published
        )
      )
    );
  }

  @Test
  void cannotEditOtherUsersTravel() {
    owner(2);
    var r = new CreateTravelRequest();
    assertEquals(
      403,
      assertThrows(BusinessException.class, () ->
        manage.update(1, 3, r)
      ).getCode()
    );
    verify(jdbc, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void cannotDeleteOtherUsersTravel() {
    owner(2);
    assertEquals(
      403,
      assertThrows(BusinessException.class, () -> manage.delete(1, 3)).getCode()
    );
    verify(jdbc, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void cannotPublishDraftOfOtherUser() {
    owner(2);
    assertThrows(BusinessException.class, () -> manage.draft(1, 3));
    verify(jdbc, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void duplicatePhotoIdsRejected() {
    owner(2);
    assertThrows(BusinessException.class, () ->
      manage.reorder(1, 2, List.of(10L, 10L), false)
    );
    verify(jdbc, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void cannotReorderForeignPhoto() {
    owner(2);
    when(
      jdbc.queryForList(
        "SELECT id FROM travel_media WHERE travel_id=? FOR UPDATE",
        Long.class,
        1L
      )
    ).thenReturn(List.of(10L, 11L));
    assertEquals(
      409,
      assertThrows(BusinessException.class, () ->
        manage.reorder(1, 2, List.of(10L, 99L), false)
      ).getCode()
    );
    verify(jdbc, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void privateTravelCannotLeakSocialState() {
    travel("PRIVATE", 1, 2, false);
    assertEquals(
      403,
      assertThrows(BusinessException.class, () -> social.state(1, 3)).getCode()
    );
  }

  @Test
  void publicDraftCannotLeakComments() {
    travel("PUBLIC", 0, 2, false);
    assertEquals(
      403,
      assertThrows(BusinessException.class, () ->
        social.comments(1, 3, 1)
      ).getCode()
    );
  }

  @Test
  void privateTravelCannotBeLiked() {
    travel("PRIVATE", 1, 2, true);
    assertThrows(BusinessException.class, () -> social.like(1, 3, true));
    verify(jdbc, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void cannotFollowSelf() {
    assertThrows(BusinessException.class, () -> social.follow(2, 2, true));
    verifyNoInteractions(jdbc);
  }

  @Test
  void emptyCommentRejectedBeforeInsert() {
    travel("PUBLIC", 1, 2, true);
    assertThrows(BusinessException.class, () -> social.comment(1, 3, "  "));
    verify(jdbc, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void oversizedCommentRejectedBeforeInsert() {
    travel("PUBLIC", 1, 2, true);
    assertThrows(BusinessException.class, () ->
      social.comment(1, 3, "x".repeat(1001))
    );
    verify(jdbc, never()).update(anyString(), any(Object[].class));
  }

  @Test
  void endBeforeStartRejected() {
    owner(2);
    var r = new CreateTravelRequest();
    r.setStartDate(java.time.LocalDate.of(2026, 10, 2));
    r.setEndDate(java.time.LocalDate.of(2026, 10, 1));
    assertThrows(BusinessException.class, () -> manage.update(1, 2, r));
  }
}
