package com.myblog.user;

import static org.mockito.Mockito.*;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.*;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.*;

import com.myblog.user.controller.*;
import com.myblog.user.exception.*;
import com.myblog.user.service.*;
import org.junit.jupiter.api.*;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;

class TravelApiTest {

  MockMvc mvc;
  TravelManageService service;

  @BeforeEach
  void setup() {
    service = mock(TravelManageService.class);
    mvc = MockMvcBuilders.standaloneSetup(new TravelManageController(service))
      .setControllerAdvice(new GlobalExceptionHandler())
      .build();
  }

  @Test
  void malformedJsonHas400() throws Exception {
    mvc
      .perform(
        put("/api/travels/1")
          .requestAttr("userId", 2L)
          .contentType(MediaType.APPLICATION_JSON)
          .content("{")
      )
      .andExpect(status().isBadRequest())
      .andExpect(jsonPath("$.code").value(400));
    verifyNoInteractions(service);
  }

  @Test
  void accessDeniedUsesHttp403() throws Exception {
    when(service.draft(1, 2)).thenThrow(
      new BusinessException(403, "只能管理自己的旅行")
    );
    mvc
      .perform(post("/api/travels/1/draft").requestAttr("userId", 2L))
      .andExpect(status().isForbidden())
      .andExpect(jsonPath("$.code").value(403));
  }

  @Test
  void missingTravelUses404() throws Exception {
    when(service.delete(1, 2)).thenThrow(
      new BusinessException(404, "旅行不存在")
    );
    mvc
      .perform(delete("/api/travels/1").requestAttr("userId", 2L))
      .andExpect(status().isNotFound());
  }
}
