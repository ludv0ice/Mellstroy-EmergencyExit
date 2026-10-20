export const freshProgress = () => ({ unlocked: 0, best: {}, last: 0 });
export class Saves {
  constructor(storage) {
    this.storage = storage;
    this.data = { active: 0, slots: [null, null, null] };
    try {
      const data = JSON.parse(storage.getItem('emergency-exit-saves'));
      if (data && Number.isInteger(data.active) && data.active >= 0 && data.active < 3 && data.slots?.length === 3) {
        this.data = data;
      } else {
        const legacy = JSON.parse(storage.getItem('emergency-exit-progress'));
        if (legacy?.best) this.data.slots[0] = { progress: legacy, checkpoint: null };
      }
    } catch {}
    if (!this.current) this.data.slots[this.data.active] = { progress: freshProgress(), checkpoint: null };
  }
  get current() { return this.data.slots[this.data.active]; }
  write() {
    try {
      this.storage.setItem('emergency-exit-saves', JSON.stringify(this.data));
      this.storage.setItem('emergency-exit-progress', JSON.stringify(this.current.progress));
      return true;
    } catch { return false; }
  }
  select(index, reset = false) {
    this.data.active = index;
    if (reset || !this.current) this.data.slots[index] = { progress: freshProgress(), checkpoint: null };
    return this.write();
  }
}
