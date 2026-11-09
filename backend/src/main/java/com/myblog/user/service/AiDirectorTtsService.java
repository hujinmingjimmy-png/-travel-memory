
package com.myblog.user.service;

import com.fasterxml.jackson.databind.JsonNode;
import com.fasterxml.jackson.databind.ObjectMapper;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.stereotype.Service;

import java.io.BufferedReader;
import java.io.ByteArrayOutputStream;
import java.io.InputStream;
import java.io.InputStreamReader;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.Base64;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

@Service
public class AiDirectorTtsService {

    // 从 Spring Boot 配置文件读取豆包参数
    @Value("${doubao.tts.api-key:}")
    private String apiKey;

    @Value("${doubao.tts.resource-id:seed-tts-2.0}")
    private String resourceId;

    @Value("${doubao.tts.url:https://openspeech.bytedance.com/api/v3/tts/unidirectional}")
    private String apiUrl;

    // 兼容原有前端传入的音色值
    private static final Set<String> VOICES =
            Set.of("coral", "alloy", "nova");

    // 单段语音最大 6MB
    private static final int MAX_AUDIO_BYTES =
            6 * 1024 * 1024;

    private final ObjectMapper mapper;

    private final HttpClient http = HttpClient.newBuilder()
            .connectTimeout(Duration.ofSeconds(10))
            .build();

    public AiDirectorTtsService(ObjectMapper mapper) {
        this.mapper = mapper;
    }

    /**
     * 检查前端传入的音色是否受支持。
     * 保留静态方法，兼容已有视频服务。
     */
    public static boolean supportedVoice(String voice) {
        return VOICES.contains(voice);
    }

    /**
     * 检查豆包 API Key 是否已配置。
     *
     * 注意：这里不能使用 static，
     * 因为 apiKey 是由 Spring 注入的实例字段。
     */
    public boolean configured() {
        return apiKey != null && !apiKey.isBlank();
    }

    /**
     * 将前端原有音色映射到豆包 2.0 音色。
     */
    private static String speaker(String voice) {

        return switch (voice) {

            // Vivi 2.0 女声
            case "coral" ->
                    "zh_female_vv_uranus_bigtts";

            // 大壹 2.0 男声
            case "alloy" ->
                    "zh_male_dayi_uranus_bigtts";

            // 流畅女声 2.0
            case "nova" ->
                    "zh_female_liuchangnv_uranus_bigtts";

            default ->
                    throw new IllegalArgumentException(
                            "Unsupported TTS voice"
                    );
        };
    }

    /**
     * 为指定分镜生成 MP3 旁白。
     *
     * caption     分镜字幕
     * voice       前端选择的音色
     * destination MP3 输出路径
     *
     * 生成后的 MP3 将交给视频服务，
     * 再使用 FFmpeg 混合到最终 MP4 中。
     */
    public void generate(
            String caption,
            String voice,
            Path destination
    ) throws Exception {

        String text =
                caption == null ? "" : caption.trim();

        // 检查文本和音色
        if (text.isBlank()
                || text.length() > 120
                || !supportedVoice(voice)) {

            throw new IllegalArgumentException(
                    "Invalid narration request"
            );
        }

        // 从 application.yml 注入的字段读取密钥
        String key = this.apiKey;

        if (key == null || key.isBlank()) {
            throw new IllegalStateException(
                    "Doubao TTS API key not configured"
            );
        }

        // 构造豆包语音合成请求
        Map<String, Object> payload = Map.of(

                "user", Map.of(
                        "uid", "travel-memory"
                ),

                "req_params", Map.of(

                        "text", text,

                        "speaker", speaker(voice),

                        "audio_params", Map.of(
                                "format", "mp3",
                                "sample_rate", 24000,
                                "speech_rate", 0
                        )
                )
        );

        // 创建 HTTP 请求
        HttpRequest request = HttpRequest.newBuilder(
                        URI.create(apiUrl)
                )
                .timeout(Duration.ofSeconds(90))
                .header(
                        "Content-Type",
                        "application/json"
                )
                .header(
                        "X-Api-Key",
                        key
                )
                .header(
                        "X-Api-Resource-Id",
                        resourceId
                )
                .header(
                        "X-Api-Request-Id",
                        UUID.randomUUID().toString()
                )
                .POST(
                        HttpRequest.BodyPublishers.ofString(
                                mapper.writeValueAsString(payload),
                                StandardCharsets.UTF_8
                        )
                )
                .build();

        // 调用豆包语音 API
        HttpResponse<InputStream> response =
                http.send(
                        request,
                        HttpResponse.BodyHandlers.ofInputStream()
                );

        try (InputStream stream = response.body()) {

            // HTTP 请求失败
            if (response.statusCode() != 200) {
                throw new IllegalStateException(
                        "Doubao TTS HTTP "
                                + response.statusCode()
                );
            }

            boolean completed = false;

            // 合并所有 MP3 音频分片
            try (
                    BufferedReader reader =
                            new BufferedReader(
                                    new InputStreamReader(
                                            stream,
                                            StandardCharsets.UTF_8
                                    )
                            );

                    ByteArrayOutputStream output =
                            new ByteArrayOutputStream()
            ) {

                String line;

                while ((line = reader.readLine()) != null) {

                    if (line.isBlank()) {
                        continue;
                    }

                    // 兼容可能带有 data: 前缀的消息
                    if (line.startsWith("data:")) {
                        line = line.substring(5).trim();
                    }

                    if (line.isBlank()
                            || "[DONE]".equals(line)) {
                        continue;
                    }

                    JsonNode part =
                            mapper.readTree(line);

                    int code =
                            part.path("code").asInt(-1);

                    // 豆包完成标记
                    if (code == 20000000) {
                        completed = true;
                        break;
                    }

                    // 豆包返回错误
                    if (code != 0) {
                        throw new IllegalStateException(
                                "Doubao TTS response code "
                                        + code
                        );
                    }

                    JsonNode data = part.path("data");

                    // 当前分片包含音频
                    if (data.isTextual()
                            && !data.asText().isBlank()) {

                        byte[] chunk =
                                Base64.getDecoder().decode(
                                        data.asText()
                                );

                        // 防止异常响应占用大量内存
                        if ((long) output.size()
                                + chunk.length
                                > MAX_AUDIO_BYTES) {

                            throw new IllegalStateException(
                                    "Doubao TTS audio too large"
                            );
                        }

                        output.write(chunk);
                    }
                }

                // 验证流式音频已经完整返回
                if (!completed || output.size() < 128) {
                    throw new IllegalStateException(
                            "Doubao TTS incomplete audio response"
                    );
                }

                // 确保音频输出目录存在
                Path parent = destination.getParent();

                if (parent != null) {
                    Files.createDirectories(parent);
                }

                // 保存 MP3 文件
                Files.write(
                        destination,
                        output.toByteArray()
                );
            }
        }
    }
}
