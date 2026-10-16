/** هل المستخدم داخل حصة مباشرة الآن؟ (لا تُقاطَع الحصة بتسجيل خروج أو تحديث بيانات دوري) */
let open = false;
export const setLiveRoomOpen = (v: boolean) => { open = v; };
export const isLiveRoomOpen = () => open;
