import { useState, useEffect, useMemo, useRef } from 'react';
import { X, Search, Check, RotateCcw, Plus, ChevronDown } from 'lucide-react';
import { useAuthStore } from '../../stores/authStore.js';
import { profileApi } from '../../services/endpoints.js';

/**
 * OnboardingModal — GNS3 image-map calibration popup.
 *
 * WHY THIS EXISTS
 * A .gns3project file references specific image filenames (e.g.
 * `c7200-adventerprisek9-mz.124-24.T5.image`). When the user imports the
 * project into THEIR GNS3 server, GNS3 refuses to open it unless those
 * exact images are already installed. This popup asks the user to map each
 * device template to the image filename they have installed, so the
 * generated projects open cleanly on their machine.
 *
 * LAYOUT (3 numbered sections, per design mockup)
 *  1. GNS3 version        — dropdown (2.2.x recommended)
 *  2. Capabilities        — 4 toggle cards in a row (QEMU / IOU / Docker / Strict)
 *  3. Device image mapping— searchable dropdown of all 45 catalog devices;
 *                           user enters their installed image filename per device
 *
 * BEHAVIOR
 * - Auto-shows on first sign-in after registration (when
 *   `!profile.isCalibrated`), per Q1(c).
 * - Re-openable from the Sidebar "Settings" button.
 * - Skippable: "Skip" saves defaults and marks the profile calibrated.
 * - Shows ALL 40+ devices from the Python appliance catalog (SSOT).
 * - The whole modal body scrolls if it overflows — the header and footer
 *   stay pinned.
 */
export default function OnboardingModal() {
  const updateProfile = useAuthStore((s) => s.updateProfile);
  const fetchProfile = useAuthStore((s) => s.fetchProfile);
  const closeProfileModal = useAuthStore((s) => s.closeProfileModal);
  const existingProfile = useAuthStore((s) => s.profile);

  const [catalog, setCatalog] = useState(null);
  const [loadingCatalog, setLoadingCatalog] = useState(true);
  const [catalogError, setCatalogError] = useState(null);
  const [query, setQuery] = useState('');
  const [imageMap, setImageMap] = useState({});

  // ── Environment capability fields ─────────────────────────
  const [gns3Version, setGns3Version] = useState('2.2');
  const [supportsIou, setSupportsIou] = useState(false);
  const [supportsQemu, setSupportsQemu] = useState(true);
  const [supportsDocker, setSupportsDocker] = useState(false);
  const [strictValidation, setStrictValidation] = useState(true);

  const [saving, setSaving] = useState(false);
  const [showDeviceList, setShowDeviceList] = useState(false);
  const [selectedDevice, setSelectedDevice] = useState(null);  // the device the user is currently mapping
  const [mappingTemplate, setMappingTemplate] = useState('');
  const [mappingImage, setMappingImage] = useState('');
  const searchRef = useRef(null);

  // ── GNS3 version options ──────────────────────────────────
  const VERSION_OPTIONS = ['2.2.46', '2.2.45', '2.2.44', '2.2.43', '2.2.42', '2.2.40', '2.2.37', '2.2.34', '2.2.31', '2.2'];

  // ── Fetch the appliance catalog on mount ──────────────────
  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const data = await profileApi.getCatalog();
        if (!cancelled) {
          setCatalog(data);
          if (existingProfile) {
            const im = existingProfile.imageMap;
            const init = im instanceof Map ? Object.fromEntries(im) : (im || {});
            setImageMap(init);
            if (existingProfile.gns3Version) setGns3Version(existingProfile.gns3Version);
            if (typeof existingProfile.supportsIou === 'boolean') setSupportsIou(existingProfile.supportsIou);
            if (typeof existingProfile.supportsQemu === 'boolean') setSupportsQemu(existingProfile.supportsQemu);
            if (typeof existingProfile.supportsDocker === 'boolean') setSupportsDocker(existingProfile.supportsDocker);
            if (typeof existingProfile.strictValidation === 'boolean') setStrictValidation(existingProfile.strictValidation);
          }
        }
      } catch (err) {
        if (!cancelled) setCatalogError(err.message || 'Failed to load device catalog');
      } finally {
        if (!cancelled) setLoadingCatalog(false);
      }
    })();
    return () => { cancelled = true; };
  }, []); // eslint-disable-line

  // ── ESC to close ──────────────────────────────────────────
  useEffect(() => {
    const handler = (e) => { if (e.key === 'Escape') handleClose(); };
    window.addEventListener('keydown', handler);
    return () => window.removeEventListener('keydown', handler);
  }, []); // eslint-disable-line

  // ── Focus search when device picker opens ─────────────────
  useEffect(() => {
    if (showDeviceList && !selectedDevice) {
      setTimeout(() => searchRef.current?.focus(), 50);
    }
  }, [showDeviceList, selectedDevice]);

  // ── Filtered devices for the image-mapping section ───────
  const filteredDevices = useMemo(() => {
    if (!catalog?.devices) return [];
    const q = query.trim().toLowerCase();
    return catalog.devices.filter(d => {
      if (!d.requires_image) return false; // only show devices that need an image
      if (!q) return true;
      return d.template.toLowerCase().includes(q)
        || (d.platform || '').toLowerCase().includes(q)
        || (d.default_image || '').toLowerCase().includes(q)
        || d.node_type.toLowerCase().includes(q);
    });
  }, [catalog, query]);

  const mappedCount = useMemo(
    () => Object.values(imageMap).filter(v => v && v.trim()).length,
    [imageMap]
  );

  const selectedMappingDevice = useMemo(() => {
    if (!mappingTemplate.trim() || !catalog?.devices) return null;
    const normalized = mappingTemplate.trim().toLowerCase();
    return catalog.devices.find((device) => device.template.toLowerCase() === normalized) || null;
  }, [catalog, mappingTemplate]);

  // ── Handlers ──────────────────────────────────────────────
  const handleClose = () => closeProfileModal();

  const handleImageChange = (template, value) => {
    setImageMap(prev => ({ ...prev, [template]: value }));
  };

  const handleUseDefault = (template, defaultImage) => {
    if (!defaultImage) return;
    setImageMap(prev => ({ ...prev, [template]: defaultImage }));
  };

  const handleUseMappingDefault = () => {
    if (!selectedMappingDevice?.default_image) return;
    setMappingImage(selectedMappingDevice.default_image);
  };

  const handleSaveMapping = () => {
    const template = mappingTemplate.trim();
    const image = mappingImage.trim();
    if (!template || !image) return;
    setImageMap(prev => ({ ...prev, [template]: image }));
    setMappingTemplate('');
    setMappingImage('');
  };

  const handleClear = (template) => {
    setImageMap(prev => {
      const next = { ...prev };
      delete next[template];
      return next;
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const cleanMap = {};
      Object.entries(imageMap).forEach(([k, v]) => {
        if (v && v.trim()) cleanMap[k] = v.trim();
      });
      await updateProfile({
        gns3Version: gns3Version.trim() || '2.2',
        supportsIou,
        supportsQemu,
        supportsDocker,
        strictValidation,
        imageMap: cleanMap,
      });
      await fetchProfile();
      closeProfileModal();
    } catch (err) {
      console.error('Failed to save profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const handleSkip = async () => {
    setSaving(true);
    try {
      await updateProfile({
        gns3Version: '2.2',
        supportsIou: false,
        supportsQemu: true,
        supportsDocker: false,
        strictValidation: true,
        imageMap: {},
      });
      await fetchProfile();
      closeProfileModal();
    } catch (err) {
      console.error('Failed to skip profile:', err);
    } finally {
      setSaving(false);
    }
  };

  const toggleCapability = (setter, current) => () => setter(!current);

  // ── Mapped devices list (for display above the + Add button) ──
  const mappedDevices = useMemo(() => {
    return Object.entries(imageMap)
      .filter(([, v]) => v && v.trim())
      .map(([template, image]) => ({ template, image }));
  }, [imageMap]);

  // ── Render ────────────────────────────────────────────────
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-md p-4 animate-fade-in">
      <div className="relative w-full max-w-2xl max-h-[90vh] flex flex-col animate-fade-in-up">
        {/* Glow halo */}
        <div className="absolute -inset-2 bg-gradient-to-br from-emerald-500/15 via-emerald-500/5 to-transparent rounded-3xl blur-2xl pointer-events-none" />

        <div className="relative flex flex-col max-h-[90vh] bg-zinc-900 rounded-2xl border border-zinc-800 shadow-2xl overflow-hidden">
          {/* ── Header (pinned) ───────────────────────────── */}
          <div className="flex-shrink-0 px-6 py-4 bg-gradient-to-br from-zinc-950 to-zinc-900 border-b border-zinc-800 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-32 h-32 bg-emerald-500/15 rounded-full blur-2xl" />
            <div className="relative flex items-start gap-3">
              <div className="flex-shrink-0 w-9 h-9 rounded-xl bg-gradient-to-br from-emerald-500 to-emerald-700 flex items-center justify-center shadow-lg shadow-emerald-500/20">
                <svg viewBox="0 0 24 24" className="w-4 h-4 text-white" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
                  <rect x="3" y="3" width="7" height="7" rx="1" />
                  <rect x="14" y="3" width="7" height="7" rx="1" />
                  <rect x="3" y="14" width="7" height="7" rx="1" />
                  <rect x="14" y="14" width="7" height="7" rx="1" />
                </svg>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-base font-semibold tracking-tight text-white">Calibrate your GNS3 profile</h2>
                <p className="text-xs text-zinc-400 mt-0.5 leading-relaxed">
                  Tell us about your setup so generated projects open cleanly on import.
                </p>
              </div>
              <button
                onClick={handleClose}
                className="flex-shrink-0 p-1.5 rounded-lg text-zinc-500 hover:text-white hover:bg-zinc-800 transition-colors"
                aria-label="Close"
              >
                <X size={16} />
              </button>
            </div>
          </div>

          {/* ── Scrollable body ────────────────────────────── */}
          <div className="flex-1 overflow-y-auto px-6 py-5 min-h-0 space-y-6">

            {/* ── Section 1: GNS3 Version ─────────────────── */}
            <section>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center">1</span>
                <div>
                  <h3 className="text-sm font-semibold text-white leading-none">GNS3 version</h3>
                  <p className="text-[11px] text-zinc-500 mt-1">Match the version installed on your GNS3 server.</p>
                </div>
              </div>
              <div className="relative ml-7">
                <select
                  value={gns3Version}
                  onChange={(e) => setGns3Version(e.target.value)}
                  className="w-full appearance-none px-3 py-2.5 rounded-lg bg-zinc-800 border border-zinc-700 text-sm text-white focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all cursor-pointer"
                >
                  {VERSION_OPTIONS.map(v => (
                    <option key={v} value={v}>GNS3 {v}</option>
                  ))}
                </select>
                <ChevronDown size={15} className="absolute right-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
              </div>
            </section>

            {/* ── Section 2: Capabilities ─────────────────── */}
            <section>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center">2</span>
                <div>
                  <h3 className="text-sm font-semibold text-white leading-none">Capabilities</h3>
                  <p className="text-[11px] text-zinc-500 mt-1">Emulation backends available on your GNS3 VM.</p>
                </div>
              </div>
              <div className="ml-7 grid grid-cols-2 sm:grid-cols-4 gap-2">
                <CapabilityCard
                  label="QEMU"
                  description="Virtual routers & firewalls"
                  checked={supportsQemu}
                  onClick={toggleCapability(setSupportsQemu, supportsQemu)}
                />
                <CapabilityCard
                  label="IOU"
                  description="Cisco L2/L3 images"
                  checked={supportsIou}
                  onClick={toggleCapability(setSupportsIou, supportsIou)}
                />
                <CapabilityCard
                  label="Docker"
                  description="Container nodes"
                  checked={supportsDocker}
                  onClick={toggleCapability(setSupportsDocker, supportsDocker)}
                />
                <CapabilityCard
                  label="Strict"
                  description="Fail on issues"
                  checked={strictValidation}
                  onClick={toggleCapability(setStrictValidation, strictValidation)}
                />
              </div>
            </section>

            {/* ── Section 3: Device image mapping ─────────── */}
            <section>
              <div className="flex items-center gap-2.5 mb-2">
                <span className="flex-shrink-0 w-5 h-5 rounded-full bg-emerald-500 text-white text-[11px] font-bold flex items-center justify-center">3</span>
                <div className="flex-1 min-w-0">
                  <h3 className="text-sm font-semibold text-white leading-none">Device image mapping</h3>
                  <p className="text-[11px] text-zinc-500 mt-1">Map device models to the image filenames installed locally.</p>
                </div>
                {mappedCount > 0 && (
                  <span className="flex-shrink-0 text-[10px] text-emerald-400 bg-emerald-500/10 border border-emerald-500/30 rounded-full px-2 py-0.5">
                    {mappedCount} mapped
                  </span>
                )}
              </div>

              <div className="ml-7">
                <div className="mb-3 rounded-lg border border-zinc-700 bg-zinc-800/30 p-3">
                  <div className="grid gap-2 sm:grid-cols-[1fr_1fr_auto]">
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                        Device
                      </label>
                      <input
                        type="text"
                        list="gns3-device-templates"
                        value={mappingTemplate}
                        onChange={(e) => setMappingTemplate(e.target.value)}
                        placeholder="Select or enter device"
                        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                      />
                      <datalist id="gns3-device-templates">
                        {(catalog?.devices || [])
                          .filter((device) => device.requires_image)
                          .map((device) => (
                            <option key={device.template} value={device.template} />
                          ))}
                      </datalist>
                    </div>

                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                        GNS3 image
                      </label>
                      <input
                        type="text"
                        value={mappingImage}
                        onChange={(e) => setMappingImage(e.target.value)}
                        placeholder={selectedMappingDevice?.default_image || 'Image filename'}
                        className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 font-mono focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                      />
                    </div>

                    <div className="flex items-end">
                      <button
                        type="button"
                        onClick={handleSaveMapping}
                        disabled={!mappingTemplate.trim() || !mappingImage.trim()}
                        className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 rounded-lg bg-emerald-500 px-3 py-2 text-xs font-semibold text-white transition-colors hover:bg-emerald-600 disabled:cursor-not-allowed disabled:bg-zinc-700 disabled:text-zinc-400"
                      >
                        <Check size={13} strokeWidth={3} />
                        Save mapping
                      </button>
                    </div>
                  </div>

                  {selectedMappingDevice?.default_image && (
                    <button
                      type="button"
                      onClick={handleUseMappingDefault}
                      className="mt-2 inline-flex items-center gap-1.5 text-[10px] text-zinc-500 transition-colors hover:text-emerald-400"
                    >
                      <RotateCcw size={11} />
                      Use catalog default: {selectedMappingDevice.default_image}
                    </button>
                  )}
                </div>

                {/* Already-mapped devices (compact list) */}
                {mappedDevices.length > 0 && (
                  <div className="space-y-1.5 mb-2.5">
                    {mappedDevices.map(({ template, image }) => (
                      <div key={template} className="flex items-center gap-2 rounded-lg border border-emerald-500/25 bg-emerald-500/[0.04] px-3 py-2">
                        <Check size={13} className="flex-shrink-0 text-emerald-400" strokeWidth={3} />
                        <div className="flex-1 min-w-0">
                          <div className="text-xs font-medium text-white truncate">{template}</div>
                          <div className="text-[10px] text-zinc-500 font-mono truncate">{image}</div>
                        </div>
                        <button
                          onClick={() => {
                            setMappingTemplate(template);
                            setMappingImage(image);
                          }}
                          className="flex-shrink-0 rounded px-2 py-1 text-[10px] font-medium text-zinc-500 transition-colors hover:bg-zinc-800 hover:text-emerald-400"
                        >
                          Edit
                        </button>
                        <button
                          onClick={() => handleClear(template)}
                          className="flex-shrink-0 p-1 rounded text-zinc-500 hover:text-red-400 hover:bg-zinc-800 transition-colors"
                          aria-label="Remove"
                        >
                          <X size={12} />
                        </button>
                      </div>
                    ))}
                  </div>
                )}

                {/* + Add button — opens the device picker (one device at a time) */}
                {!showDeviceList && (
                  <button
                    onClick={() => setShowDeviceList(true)}
                    className="w-full flex items-center justify-center gap-1.5 rounded-lg border border-dashed border-zinc-700 hover:border-emerald-500/50 hover:bg-zinc-800/40 text-zinc-400 hover:text-emerald-400 text-xs font-medium py-2.5 transition-all"
                  >
                    <Plus size={14} /> Add device mapping
                  </button>
                )}

                {/* Device picker + image input (additive flow) */}
                {showDeviceList && (
                  <div className="mt-2.5 space-y-2.5 animate-fade-in rounded-lg border border-zinc-700 bg-zinc-800/30 p-3">
                    {/* Step 1: Pick a device (searchable dropdown) */}
                    <div>
                      <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                        Pick a device
                      </label>
                      <div className="relative">
                        <Search size={13} className="absolute left-3 top-1/2 -translate-y-1/2 text-zinc-500 pointer-events-none" />
                        <input
                          ref={searchRef}
                          type="text"
                          value={query}
                          onChange={(e) => setQuery(e.target.value)}
                          placeholder="Search... (e.g. 'Cisco 7200', 'IOSv')"
                          className="w-full pl-9 pr-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-500 focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                        />
                      </div>

                      {/* Device picker results — the user PICKS one device */}
                      {loadingCatalog && (
                        <div className="flex items-center justify-center py-4 text-zinc-500 text-xs">
                          <span className="inline-block w-4 h-4 border-2 border-zinc-600 border-t-emerald-500 rounded-full animate-spin mr-2" />
                          Loading devices...
                        </div>
                      )}
                      {catalogError && (
                        <div className="rounded-lg border border-red-500/30 bg-red-500/5 px-3 py-2 text-xs text-red-300 mt-2">
                          {catalogError}
                        </div>
                      )}
                      {!loadingCatalog && !catalogError && (
                        <div className="mt-2 max-h-40 overflow-y-auto rounded-lg border border-zinc-800 bg-zinc-950/50">
                          {filteredDevices.length === 0 && (
                            <div className="text-center py-4 text-zinc-500 text-xs">
                              No devices match "{query}"
                            </div>
                          )}
                          {filteredDevices.map(device => {
                            const isMapped = !!(imageMap[device.template] || '').trim();
                            const isSelected = selectedDevice?.template === device.template;
                            return (
                              <button
                                key={device.template}
                                onClick={() => setSelectedDevice(device)}
                                className={`w-full flex items-center gap-2 px-3 py-2 text-left border-b border-zinc-800 last:border-b-0 transition-colors ${
                                  isSelected ? 'bg-emerald-500/10' : 'hover:bg-zinc-800/50'
                                }`}
                              >
                                <div className="flex-1 min-w-0">
                                  <div className="flex items-center gap-1.5">
                                    <span className="text-xs font-medium text-white truncate">{device.template}</span>
                                    {device.platform && (
                                      <span className="text-[9px] font-mono text-zinc-500 bg-zinc-800 px-1 py-0.5 rounded flex-shrink-0">
                                        {device.platform}
                                      </span>
                                    )}
                                  </div>
                                  {device.default_image && (
                                    <div className="text-[10px] text-zinc-600 font-mono truncate mt-0.5">
                                      default: {device.default_image}
                                    </div>
                                  )}
                                </div>
                                {isMapped && (
                                  <Check size={12} className="flex-shrink-0 text-emerald-400" strokeWidth={3} />
                                )}
                                {isSelected && !isMapped && (
                                  <Check size={12} className="flex-shrink-0 text-emerald-400" strokeWidth={3} />
                                )}
                              </button>
                            );
                          })}
                        </div>
                      )}
                    </div>

                    {/* Step 2: Write the image filename (only after a device is picked) */}
                    {selectedDevice && (
                      <div className="animate-fade-in">
                        <label className="block text-[10px] font-semibold uppercase tracking-wider text-zinc-500 mb-1.5">
                          Image filename <span className="text-zinc-600 normal-case font-normal">(copy from your GNS3 server)</span>
                        </label>
                        <input
                          type="text"
                          value={imageMap[selectedDevice.template] || ''}
                          onChange={(e) => handleImageChange(selectedDevice.template, e.target.value)}
                          placeholder={selectedDevice.default_image ? `e.g. ${selectedDevice.default_image}` : 'image filename'}
                          autoFocus
                          className="w-full px-3 py-2 rounded-lg bg-zinc-900 border border-zinc-700 text-xs text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
                        />
                        {selectedDevice.default_image && (
                          <button
                            onClick={() => handleUseDefault(selectedDevice.template, selectedDevice.default_image)}
                            className="mt-1.5 text-[10px] text-zinc-500 hover:text-emerald-400 transition-colors"
                          >
                            Use catalog default: {selectedDevice.default_image}
                          </button>
                        )}
                        <div className="flex items-center gap-2 mt-2">
                          <button
                            onClick={() => { setSelectedDevice(null); setQuery(''); setShowDeviceList(false); }}
                            className="flex-1 text-xs text-zinc-400 hover:text-white py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                            Done
                          </button>
                          <button
                            onClick={() => { setSelectedDevice(null); setQuery(''); }}
                            className="flex-1 text-xs text-zinc-400 hover:text-emerald-400 py-1.5 rounded-lg hover:bg-zinc-800 transition-colors"
                          >
                            Add another device
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )}
              </div>
            </section>
          </div>

          {/* ── Footer (pinned) ───────────────────────────── */}
          <div className="flex-shrink-0 flex items-center justify-between px-6 py-4 bg-zinc-950/50 border-t border-zinc-800">
            <button
              onClick={handleSkip}
              disabled={saving}
              className="text-xs text-zinc-400 hover:text-white font-medium transition-colors disabled:opacity-50"
            >
              Skip — I'll configure later
            </button>
            <button
              onClick={handleSave}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-xl bg-emerald-500 hover:bg-emerald-600 text-white text-sm font-medium px-5 py-2.5 transition-colors disabled:bg-zinc-700 disabled:cursor-not-allowed shadow-lg shadow-emerald-500/20"
            >
              {saving ? (
                <>
                  <span className="inline-block w-4 h-4 border-2 border-white/30 border-t-white rounded-full animate-spin" />
                  Saving...
                </>
              ) : (
                <>
                  <Check size={16} />
                  Save & Continue
                </>
              )}
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ── CapabilityCard — compact toggle card for the 4-up grid ──────
function CapabilityCard({ label, description, checked, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex flex-col items-start gap-1 rounded-lg border px-3 py-2.5 text-left transition-all ${
        checked
          ? 'border-emerald-500/40 bg-emerald-500/[0.06]'
          : 'border-zinc-700 bg-zinc-800/40 hover:border-zinc-600'
      }`}
    >
      <div className="flex items-center gap-1.5">
        <span className={`flex-shrink-0 w-4 h-4 rounded-full flex items-center justify-center transition-colors ${
          checked ? 'bg-emerald-500 text-white' : 'bg-zinc-700 text-transparent'
        }`}>
          {checked && <Check size={10} strokeWidth={3.5} />}
        </span>
        <span className="text-xs font-semibold text-white">{label}</span>
      </div>
      <span className="text-[10px] text-zinc-500 leading-tight">{description}</span>
    </button>
  );
}

// ── DeviceRow — one device template + its image input ─────────
function DeviceRow({ device, value, onChange, onUseDefault, onClear }) {
  const isMapped = value && value.trim();
  return (
    <div className={`flex items-center gap-2 px-3 py-2 border-b border-zinc-800 last:border-b-0 transition-colors ${
      isMapped ? 'bg-emerald-500/[0.04]' : ''
    }`}>
      <div className="flex-1 min-w-0">
        <div className="flex items-center gap-1.5">
          <span className="text-xs font-medium text-white truncate">{device.template}</span>
          {device.platform && (
            <span className="text-[9px] font-mono text-zinc-500 bg-zinc-800 px-1 py-0.5 rounded flex-shrink-0">
              {device.platform}
            </span>
          )}
        </div>
        {device.default_image && !isMapped && (
          <div className="text-[10px] text-zinc-600 font-mono truncate mt-0.5">
            default: {device.default_image}
          </div>
        )}
      </div>
      <input
        type="text"
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={device.default_image || 'image filename'}
        className="w-44 px-2 py-1 rounded bg-zinc-900 border border-zinc-700 text-[11px] text-white placeholder-zinc-600 font-mono focus:outline-none focus:border-emerald-500/50 focus:ring-1 focus:ring-emerald-500/20 transition-all"
      />
      {device.default_image && (
        <button
          onClick={onUseDefault}
          title="Use default"
          className="flex-shrink-0 p-1 rounded text-zinc-500 hover:text-emerald-400 hover:bg-zinc-800 transition-colors"
          aria-label="Use default"
        >
          <RotateCcw size={11} />
        </button>
      )}
    </div>
  );
}
