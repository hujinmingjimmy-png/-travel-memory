package com.myblog.user.exception;

import com.myblog.user.common.ApiResult;
import org.springframework.dao.DuplicateKeyException;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.web.bind.annotation.*;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.multipart.MaxUploadSizeExceededException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {

  @ExceptionHandler(BusinessException.class)
  public ResponseEntity<ApiResult<Object>> business(BusinessException e) {
    return ResponseEntity.status(e.getCode()).body(
      ApiResult.fail(e.getCode(), e.getMessage())
    );
  }

  @ExceptionHandler({
    HttpMessageNotReadableException.class,
    MethodArgumentTypeMismatchException.class,
  })
  public ResponseEntity<ApiResult<Object>> badRequest(Exception e) {
    return ResponseEntity.badRequest().body(
      ApiResult.fail(400, "请求参数格式不正确")
    );
  }

  @ExceptionHandler(MaxUploadSizeExceededException.class)
  public ResponseEntity<ApiResult<Object>> upload(Exception e) {
    return ResponseEntity.status(413).body(
      ApiResult.fail(413, "图片超出上传大小限制")
    );
  }

  @ExceptionHandler(DuplicateKeyException.class)
  public ResponseEntity<ApiResult<Object>> conflict(Exception e) {
    return ResponseEntity.status(409).body(
      ApiResult.fail(409, "记录已存在，请刷新后重试")
    );
  }

  @ExceptionHandler(NoResourceFoundException.class)
  public ResponseEntity<ApiResult<Object>> notFound(NoResourceFoundException e) {
    return ResponseEntity.status(404).body(ApiResult.fail(404, "未找到请求的资源"));
  }

  @ExceptionHandler(Exception.class)
  public ResponseEntity<ApiResult<Object>> unexpected(Exception e) {
    org.slf4j.LoggerFactory.getLogger(getClass()).error("API请求失败", e);
    return ResponseEntity.internalServerError().body(
      ApiResult.fail(500, "服务器内部错误")
    );
  }
}
