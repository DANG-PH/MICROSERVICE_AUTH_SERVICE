export function otpEmailTemplate(user: any, otp: string) {
  return `
        <meta name="color-scheme" content="light dark">
        <meta name="supported-color-schemes" content="light dark">

        <div style="
          font-family: Arial, sans-serif;
          background: #0f172a !important;
          color: #f8fafc !important;
          padding: 20px;
          border-radius: 12px;
          max-width: 450px;
          margin: auto;
          border: 2px solid #38bdf8 !important;
        ">
          <div style="text-align: center; margin-bottom: 12px;">
            <img src="https://i.postimg.cc/vHgpK4JX/avt9.webp"
              alt="Ngọc Rồng Online Logo"
              style="
                width: 120px;
                height: 120px;
                object-fit: cover;
                border-radius: 50%;
                border: 2px solid #38bdf8;
                box-shadow: 0 0 10px rgba(56, 189, 248, 0.3);
              " />
          </div>

          <h2 style="text-align:center; margin-bottom: 12px; color: #38bdf8 !important;">
            NGỌC RỒNG ONLINE
          </h2>

          <p style="font-size:14px; line-height:1.5; color: #f8fafc !important;">
            Xin chào ${user.realname},<br/>
            Bạn đang yêu cầu đăng nhập tài khoản. Vui lòng dùng mã bên dưới để xác thực:
          </p>

          <div style="
            margin: 20px auto;
            padding: 12px 0;
            background: #1e293b !important;
            border-radius: 10px;
            text-align:center;
            border: 1px solid #38bdf8 !important;
          ">
            <span style="
              font-size: 28px;
              font-weight: bold;
              color: #38bdf8 !important;
              font-family: 'Courier New', monospace;
            ">
              ${otp}
            </span>
          </div>

          <p style="font-size:14px; color: #f8fafc !important;">
            Mã OTP có hiệu lực trong <b>5 phút</b>.<br/>
            Không cung cấp mã cho bất kỳ ai để tránh mất tài khoản.
          </p>

          <hr style="border: none; border-top: 1px solid #334155; margin: 20px 0;" />

          <div style="text-align:center; font-size:12px; color:#94a3b8 !important;">
            © Ngọc Rồng Online – 2025 <br/>
            Nếu có thắc mắc vui lòng liên hệ admin Hải Đăng
          </div>
        </div>
        `;
}


export function securityAlertEmailTemplate(realname: string) {
  return `
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">

    <div style="
      font-family: Arial, sans-serif;
      background: #2d1b1b !important;
      color: #fff1f2 !important;
      padding: 20px;
      border-radius: 12px;
      max-width: 450px;
      margin: auto;
      border: 2px solid #fb7185 !important;
    ">
      <div style="text-align: center; margin-bottom: 12px;">
        <img src="https://i.postimg.cc/vHgpK4JX/avt9.webp"
          alt="Security Alert"
          style="
            width: 120px;
            height: 120px;
            object-fit: cover;
            border-radius: 50%;
            border: 2px solid #fb7185;
            box-shadow: 0 0 12px rgba(251, 113, 133, 0.4);
          " />
      </div>

      <h2 style="text-align:center; margin-bottom: 12px; color: #fb7185 !important;">
        CẢNH BÁO BẢO MẬT – NGỌC RỒNG ONLINE
      </h2>

      <p style="font-size:14px; line-height:1.5; color: #ffe4e6 !important;">
        Xin chào <b>${realname}</b>,<br/>
        Chúng tôi vừa phát hiện nhiều lần đăng nhập thất bại bất thường
        vào tài khoản của bạn trong thời gian ngắn.
      </p>

      <div style="
        background: #3f1d1d !important;
        padding: 14px;
        border-radius: 10px;
        border: 1px solid #fb7185 !important;
        margin: 18px 0;
        text-align:center;
        color:#fecdd3 !important;
      ">
        Tài khoản của bạn đã bị <b>khóa tạm thời 10 phút</b><br/>
        để đảm bảo an toàn.
      </div>

      <p style="font-size:14px; color: #ffe4e6 !important;">
        Nếu đây là bạn, vui lòng thử lại sau.<br/>
        Nếu không phải bạn, hãy đổi mật khẩu ngay khi đăng nhập lại được.
      </p>

      <hr style="border: none; border-top: 1px solid #7f1d1d; margin: 20px 0;" />

      <div style="text-align:center; font-size:12px; color:#fecdd3 !important;">
        © Ngọc Rồng Online – 2025 <br/>
        Nếu bạn cần hỗ trợ vui lòng liên hệ admin Hải Đăng.
      </div>
    </div>
  `;
}

// ===== RESET PASSWORD EMAIL TEMPLATE =====
export function resetPasswordEmailTemplate(user: { realname: string }): string {
  return `
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <div style="
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      max-width: 450px;
      margin: auto;
      border: 2px solid #f97316;
    ">
      <div style="text-align:center; margin-bottom:12px;">
        <img src="https://i.postimg.cc/vHgpK4JX/avt9.webp"
             alt="Ngọc Rồng Online Logo"
             style="width:120px;height:120px;object-fit:cover;border-radius:50%;border:2px solid #f97316;box-shadow:0 0 10px rgba(249,115,22,0.3);" />
      </div>

      <h2 style="text-align:center; margin-bottom:12px; color:#f97316;">MẬT KHẨU ĐÃ ĐƯỢC ĐẶT LẠI</h2>

      <p style="font-size:14px; line-height:1.5;">
        Xin chào ${user.realname},<br/>
        Mật khẩu của bạn đã được đặt lại thành công.
      </p>

      <p style="font-size:14px;">
        Nếu bạn không thực hiện yêu cầu này, vui lòng liên hệ ngay với admin để bảo vệ tài khoản.
      </p>

      <hr style="border:none; border-top:1px solid #334155; margin:20px 0;" />

      <div style="text-align:center; font-size:12px; color:#94a3b8;">
        © Ngọc Rồng Online – 2025
      </div>
    </div>
  `;
}

// ===== CHANGE EMAIL CONFIRMATION EMAIL TEMPLATE =====
export function changeEmailConfirmationTemplate(user: { realname: string }, newEmail: string): string {
  return `
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <div style="
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      max-width: 450px;
      margin: auto;
      border: 2px solid #38bdf8;
    ">
      <div style="text-align:center; margin-bottom:12px;">
        <img src="https://i.postimg.cc/vHgpK4JX/avt9.webp"
             alt="Ngọc Rồng Online Logo"
             style="width:120px;height:120px;object-fit:cover;border-radius:50%;border:2px solid #38bdf8;box-shadow:0 0 10px rgba(56,189,248,0.3);" />
      </div>

      <h2 style="text-align:center; margin-bottom:12px; color:#38bdf8;">EMAIL ĐÃ ĐƯỢC CẬP NHẬT</h2>

      <p style="font-size:14px; line-height:1.5;">
        Xin chào ${user.realname},<br/>
        Email của bạn đã được cập nhật thành <b>${newEmail}</b>.
      </p>

      <p style="font-size:14px;">
        Nếu bạn không thực hiện yêu cầu này, vui lòng liên hệ admin ngay lập tức.
      </p>

      <hr style="border:none; border-top:1px solid #334155; margin:20px 0;" />

      <div style="text-align:center; font-size:12px; color:#94a3b8;">
        © Ngọc Rồng Online – 2025
      </div>
    </div>
  `;
}

export function otpResetPassTemplate(realname: string, otp: string): string {
  return `
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    <div style="
      font-family: Arial, sans-serif;
      background: #0f172a;
      color: #f8fafc;
      padding: 20px;
      border-radius: 12px;
      max-width: 450px;
      margin: auto;
      border: 2px solid #3c4447ff;
    ">
      <div style="text-align:center; margin-bottom:12px;">
        <img src="https://i.postimg.cc/vHgpK4JX/avt9.webp"
             alt="Ngọc Rồng Online Logo"
             style="width:120px;height:120px;object-fit:cover;border-radius:50%;border:2px solid #38bdf8;box-shadow:0 0 10px rgba(56,189,248,0.3);" />
      </div>

      <h2 style="text-align:center; margin-bottom:12px; color:#38bdf8;">YÊU CẦU RESET MẬT KHẨU</h2>

      <p style="font-size:14px; line-height:1.5;">
        Xin chào ${realname},<br/>
        Bạn vừa yêu cầu đặt lại mật khẩu. Vui lòng sử dụng mã OTP bên dưới để xác thực:
      </p>

      <div style="
        margin: 20px auto;
        padding: 12px 0;
        background: #1e293b;
        border-radius: 10px;
        text-align:center;
        border: 1px solid #38bdf8;
      ">
        <span style="
          font-size: 28px;
          font-weight: bold;
          color: #38bdf8;
          font-family: 'Courier New', monospace;
        ">${otp}</span>
      </div>

      <p style="font-size:14px;">
        Mã OTP có hiệu lực trong <b>5 phút</b>. Không chia sẻ mã với bất kỳ ai.
      </p>

      <hr style="border:none; border-top:1px solid #334155; margin:20px 0;" />

      <div style="text-align:center; font-size:12px; color:#94a3b8;">
        © Ngọc Rồng Online – 2025
      </div>
    </div>
  `;
}

// Template do player manager gửi
export function ManagerEmailTemplate(
  title: string,
  content: string,
  realname?: string,
) {
  const displayName = realname || "Chiến Binh";

  return `
    <meta name="color-scheme" content="light dark">
    <meta name="supported-color-schemes" content="light dark">
    
    <div style="
      font-family: Arial, sans-serif;
      background: #111827 !important;
      color: #e0e7ff !important;
      padding: 24px;
      border-radius: 14px;
      max-width: 500px;
      margin: auto;
      border: 2px solid #6366f1 !important;
      box-shadow: 0 0 14px rgba(99,102,241,0.4);
    ">
      <div style="text-align: center; margin-bottom: 16px;">
        <img src="https://i.postimg.cc/vHgpK4JX/avt9.webp"
          alt="Notification"
          style="
            width: 110px;
            height: 110px;
            object-fit: cover;
            border-radius: 50%;
            border: 2px solid #6366f1;
          "
        />
      </div>

      <h2 style="text-align:center; margin-bottom: 14px; color: #818cf8 !important;">
        ${title.toUpperCase()}
      </h2>

      <p style="font-size:14px; line-height:1.6; color: #c7d2fe !important;">
        Xin chào <b>${displayName}</b>,<br/>
        ${content}
      </p>

      <hr style="border:none; border-top:1px solid #374151; margin: 20px 0;" />

      <div style="text-align:center; font-size:12px; color:#9ca3af !important;">
        © Ngọc Rồng Online – 2025 <br/>
        Nếu bạn cần hỗ trợ vui lòng liên hệ admin Hải Đăng.
      </div>
    </div>
  `;
}