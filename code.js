export default {
  async fetch(request, env) {
    const url = new URL(request.url);

    // ========================================
    // 1. 獲取請求信息
    // ========================================

    const file = url.pathname.substring(1);
    const token = url.searchParams.get("token");
    const userAgent = request.headers.get("User-Agent") || "";
    const ua = userAgent.toLowerCase();

    // ========================================
    // 2. 允許訪問的文件
    // ========================================

    const ALLOWED_FILES = [
      "config.yaml",
      "config.conf"
    ];

    if (!ALLOWED_FILES.includes(file)) {
      return new Response("File Not Found", {
        status: 404
      });
    }

    // ========================================
    // 3. Token 權限配置
    // ========================================

    const ACCESS = [
      {
        token: env.CLASH_TOKEN,
        file: "config.yaml",
        userAgents: [
          "clash",
          "mihomo"
        ],
        expires: env.CLASH_DDL
      },
      {
        token: env.SURGE_TOKEN,
        file: "config.conf",
        userAgents: [
          "surge",
          "surfboard"
        ],
        expires: env.SURGE_DDL
      }
    ];

    // ========================================
    // 4. 檢查 Token 是否存在
    // ========================================

    if (!token) {
      return new Response("Missing token", {
        status: 401
      });
    }

    // ========================================
    // 5. 檢查 Token + 文件權限
    // ========================================

    const access = ACCESS.find(
      item =>
        item.token &&
        item.token === token &&
        item.file === file
    );

    if (!access) {
      return new Response("Invalid token or file", {
        status: 403
      });
    }

    // ========================================
    // 6. 檢查 Token 是否過期
    // ========================================

    if (
      access.expires !== null &&
      Date.now() >= new Date(`${access.expires}T00:00:00Z`).getTime()
    ) {
      return new Response("Token expired", {
        status: 403
      });
    }

    // ========================================
    // 7. 檢查 User-Agent
    // ========================================

    const validUserAgent = access.userAgents.some(
      allowed =>
        ua.includes(allowed.toLowerCase())
    );

    if (!validUserAgent) {
      return new Response("Invalid User-Agent", {
        status: 403
      });
    }

    // ========================================
    // 8. GitHub Repo 信息
    // ========================================

    const GHID = "GHID";
    const GHREPO = "GHREPO";
    const GHBRANCH = "GHBRANCH";

    // ========================================
    // 9. GitHub API 地址
    // ========================================

    const githubUrl =
      `https://api.github.com/repos/${GHID}/${GHREPO}/contents/${file}?ref=${GHBRANCH}`;

    // ========================================
    // 10. 請求 GitHub Private Repo
    // ========================================

    if (!env.GITHUB_TOKEN) {
      return new Response("GITHUB_TOKEN is missing", {
        status: 500
      });
    }

    const githubResponse = await fetch(githubUrl, {
      headers: {
        "Authorization": `Bearer ${env.GITHUB_TOKEN}`,
        "Accept": "application/vnd.github+json",
        "X-GitHub-Api-Version": "2022-11-28",
        "User-Agent": "Cloudflare-Worker"
      }
    });

    // ========================================
    // 11. 檢查 GitHub 嚮應
    // ========================================

    if (!githubResponse.ok) {
      return new Response(
        `GitHub Error: ${githubResponse.status}`,
        {
          status: 502
        }
      );
    }

    const data = await githubResponse.json();

    if (!data.content) {
      return new Response(
        "GitHub file content not found",
        {
          status: 502
        }
      );
    }

    // ========================================
    // 12. Base64 解碼
    // ========================================

    const binary = Uint8Array.from(
      atob(data.content.replace(/\n/g, "")),
      c => c.charCodeAt(0)
    );

    // ========================================
    // 13. 返回配置文件
    // ========================================

    return new Response(binary, {
      status: 200,

      headers: {
        "Content-Type": "text/plain; charset=utf-8",

        // 不緩存
        "Cache-Control": "no-store",

        // 防止 MIME 類型被修改
        "X-Content-Type-Options": "nosniff"
      }
    });
  }
};
