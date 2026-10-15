-- منصة إتقان: صلاحية المشارك في غرفة Jitsi من رمز الدخول (JWT) الذي توقّعه المنصة
--  context.user.moderator = true (أو affiliation = owner) ← مشرف الغرفة (المعلم)
--  غير ذلك ← مشارك عادي (الطالب)
-- يُحمَّل على مكوّن conference ضمن modules_enabled، ويعمل مع token_verification.

local function is_system(jid)
    -- حسابات Jitsi الداخلية (jicofo وjvb وغيرها) لا تُمس
    return jid == nil or jid:match("^focus@") or jid:match("^jvb@") or jid:match("^recorder@") or jid:match("^jibri@")
end

local function is_moderator(user)
    if not user then return false end
    local m = user["moderator"]
    if m == true or m == "true" then return true end
    local a = user["affiliation"]
    return a == "owner" or a == "moderator" or a == "teacher"
end

module:hook("muc-occupant-pre-join", function(event)
    local room, occupant, session = event.room, event.occupant, event.origin
    if not occupant or is_system(occupant.bare_jid) then return end
    if room.jid and room.jid:match("^__jicofo%-health%-check") then return end
    local user = session and session.jitsi_meet_context_user
    if is_moderator(user) then
        room:set_affiliation(true, occupant.bare_jid, "owner")
        occupant.role = "moderator"
    else
        room:set_affiliation(true, occupant.bare_jid, "member")
    end
end, 2)

module:log("info", "itqan_affiliation loaded")
