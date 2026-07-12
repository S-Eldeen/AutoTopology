"""
constants/appliances.py — Static Appliance Catalog Data for StructraNet AI

Defines the mandatory creation properties for every GNS3 appliance type
that StructraNet AI can emit.  These properties are required by the GNS3
server (or by the .gns3project portable-project format) to create a
functional node — without them, GNS3 will reject the node or silently
default to broken values.

Sources: GNS3 server v2.2 source code
  - gns3server/controller/template_manager.py    (built-in template defaults)
  - gns3server/schemas/dynamips_template.py       (Dynamips schema & defaults)
  - gns3server/schemas/iou_template.py            (IOU schema & defaults)
  - gns3server/schemas/vpcs_template.py           (VPCS schema & defaults)
  - gns3server/schemas/ethernet_switch_template.py
  - gns3server/schemas/ethernet_hub_template.py
  - gns3server/schemas/cloud_template.py
  - gns3server/schemas/nat.py
  - gns3server/schemas/frame_relay_switch.py
  - gns3server/schemas/atm_switch.py
  - gns3server/schemas/qemu_template.py           (QEMU schema & defaults)
  - gns3server/schemas/docker_template.py         (Docker schema & defaults)
  - gns3-registry/appliances/*.gns3a              (QEMU/Docker appliance files)

V2 changes vs V1
─────────────────
  • Added 17 new QEMU appliances covering all major GNS3 device categories:
    Cisco IOSv, IOSv-L2, ASAv, Nexus 9000v, Catalyst 8000v,
    Juniper vMX, vSRX, Arista vEOS, Cumulus VX,
    FortiGate, Palo Alto VM-100, Check Point Gaia,
    VyOS, Dell OS10, Ubuntu, Kali Linux, Windows,
    Ostinato, TRex
  • Added port_name_format / port_segment_size / first_port_name per appliance
    so the exporter can generate correct Cisco/Juniper/Arista interface names
    (e.g. GigabitEthernet0/0, ge-0/0/0, Ethernet1/1, swp1).
  • Added multi-disk support fields (hdb_disk_image, hdb_disk_interface,
    hdc_disk_image, hdc_disk_interface) for appliances that require multiple
    disks (Nexus 9000v, vMX, vEOS).
  • Added appliance-specific boot/VM properties (kvm, options, boot_priority,
    adapter_type, symbol) so the exporter injects correct QEMU flags.
  • Catalog keys that are NOT in the GNS3 QEMU/Docker schema are prefixed
    with underscore (e.g. _symbol, _category) so _clean_properties can
    identify and strip them before export.  Schema-valid keys (kvm, options,
    boot_priority, adapter_type, linked_clone, cpus, usage, first_port_name)
    pass through naturally.
"""

from typing import Any, Dict, List

# ═══════════════════════════════════════════════════════════════════════════════
#  Helper: Default 8-port switch ports_mapping
#  GNS3 creates 8 access ports (VLAN 1) by default on ethernet_switch.
#  Source: gns3server/compute/builtin/nodes/ethernet_switch.py
# ═══════════════════════════════════════════════════════════════════════════════

_DEFAULT_SWITCH_PORTS: List[Dict[str, Any]] = [
    {"name": f"Ethernet{i}", "port_number": i, "type": "access", "vlan": 1, "ethertype": ""}
    for i in range(8)
]

# ═══════════════════════════════════════════════════════════════════════════════
#  Helper: Default 8-port hub ports_mapping
#  Source: gns3server/compute/builtin/nodes/ethernet_hub.py
# ═══════════════════════════════════════════════════════════════════════════════

_DEFAULT_HUB_PORTS: List[Dict[str, Any]] = [
    {"name": f"Ethernet{i}", "port_number": i}
    for i in range(8)
]

# ═══════════════════════════════════════════════════════════════════════════════
#  Keys in APPLIANCE_CATALOG entries that are NOT valid GNS3 node properties.
#  These are metadata used only by StructraNet AI's exporter / LLM pipeline.
#  _clean_properties() strips them before writing to the .gns3project JSON.
# ═══════════════════════════════════════════════════════════════════════════════

CATALOG_META_KEYS: frozenset = frozenset([
    "port_name_format",
    "port_segment_size",
    "first_port_name",
    "_symbol",
    "_category",
    "_interfaces",
    "_hardware_summary",
    "_image_required",
    "_link_count",
])

# ═══════════════════════════════════════════════════════════════════════════════
#  QEMU schema-valid keys that _clean_properties should ALLOW through.
#  These are all legitimate qemu_template.py schema properties.
# ═══════════════════════════════════════════════════════════════════════════════

QEMU_SCHEMA_KEYS: frozenset = frozenset([
    "adapter_type", "adapters", "boot_priority", "console_type",
    "cpus", "hda_disk_image", "hda_disk_interface",
    "hdb_disk_image", "hdb_disk_interface",
    "hdc_disk_image", "hdc_disk_interface",
    "hdd_disk_image", "hdd_disk_interface",
    "kvm", "linked_clone", "on_close", "options",
    "platform", "process_priority", "ram",
    "usage", "mac_address",
])


APPLIANCE_CATALOG: Dict[str, Dict[str, Any]] = {

    # ═══════════════════════════════════════════════════════════════════════════
    #  DYNAMIPS  (source: gns3server/schemas/dynamips_template.py)
    # ═══════════════════════════════════════════════════════════════════════════

    "Cisco 7200": {
        "node_type":         "dynamips",
        "platform":          "c7200",
        "image":             "c7200-adventerprisek9-mz.124-24.T5.image",
        "ram":               512,          # GNS3 default for c7200
        "nvram":             512,          # GNS3 default for c7200
        "slot0":             "C7200-IO-FE",
        "console_type":      "telnet",
        "port_name_format":  "FastEthernet{0}/{1}",
        "port_segment_size": 1,
    },

    "Cisco 3745": {
        "node_type":         "dynamips",
        "platform":          "c3745",
        "image":             "c3745-adventerprisek9-mz.124-25d.image",
        "ram":               128,          # GNS3 default for c3745
        "nvram":             256,          # GNS3 default for c3745
        "slot0":             "GT96100-FE",
        "console_type":      "telnet",
        "port_name_format":  "FastEthernet{0}/{1}",
        "port_segment_size": 1,
    },

    "Cisco 3725": {
        "node_type":         "dynamips",
        "platform":          "c3725",
        "image":             "c3745-adventerprisek9-mz.124-25d.image",
        "ram":               128,          # GNS3 default for c3725
        "nvram":             256,          # GNS3 default for c3725
        "slot0":             "GT96100-FE",
        "console_type":      "telnet",
        "port_name_format":  "FastEthernet{0}/{1}",
        "port_segment_size": 1,
    },

    "Cisco 3660": {
        "node_type":         "dynamips",
        "platform":          "c3600",      # GNS3 uses "c3600" for all 36xx
        "chassis":           "3660",       # Distinguishes from 3620/3640
        "image":             "c3660-a3jk9s-mz.124-25d.image",
        "ram":               192,          # GNS3 default for c3600 platform
        "nvram":             256,
        "slot0":             "Leopard-2FE",
        "console_type":      "telnet",
        "port_name_format":  "FastEthernet{0}/{1}",
        "port_segment_size": 1,
    },

    "Cisco 3640": {
        "node_type":         "dynamips",
        "platform":          "c3600",
        "chassis":           "3640",
        "image":             "c3640-a3js-mz.124-25d.image",
        "ram":               128,          # GNS3 default for c3640
        "nvram":             256,
        # No slot0 — slot 0 is user-configurable on c3640/c3620
        "console_type":      "telnet",
        "port_name_format":  "Ethernet{0}/{1}",
        "port_segment_size": 1,
    },

    "Cisco 2691": {
        "node_type":         "dynamips",
        "platform":          "c2691",
        "image":             "c2691-adventerprisek9-mz.124-25d.image",
        "ram":               192,          # GNS3 default for c2691
        "nvram":             256,
        "slot0":             "GT96100-FE",
        "console_type":      "telnet",
        "port_name_format":  "FastEthernet{0}/{1}",
        "port_segment_size": 1,
    },

    "Cisco 2600": {
        "node_type":         "dynamips",
        "platform":          "c2600",
        "chassis":           "2600",
        "image":             "c2600-adventerprisek9-mz.124-25d.image",
        "ram":               160,          # GNS3 default for c2600
        "nvram":             128,
        "slot0":             "C2600-MB-1FE-TX",  # Corrected from NM-1FE-TX
        "console_type":      "telnet",
        "port_name_format":  "FastEthernet{0}/{1}",
        "port_segment_size": 1,
    },

    "Cisco 1700": {
        "node_type":         "dynamips",
        "platform":          "c1700",
        "chassis":           "1721",       # Most common 1700 chassis
        "image":             "c1700-adventerprisek9-mz.124-25d.image",
        "ram":               160,          # GNS3 default for c1700
        "nvram":             128,
        "slot0":             "C1700-MB-1FE-TX",  # Corrected from C1700-MB-1ETH
        "console_type":      "telnet",
        "port_name_format":  "FastEthernet{0}",
        "port_segment_size": 1,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  IOU  (source: gns3server/schemas/iou_template.py)
    # ═══════════════════════════════════════════════════════════════════════════

    "IOU L3": {
        "node_type":         "iou",
        "path":              "/opt/gns3/images/i86bi-linux-l3-adventerprisek9-15.5.2T.bin",
        "ram":               256,          # GNS3 default
        "nvram":             128,          # GNS3 default
        "ethernet_adapters": 2,
        "serial_adapters":   0,
        "console_type":      "telnet",
        "port_name_format":  "Ethernet{0}/{1}",
        "port_segment_size": 4,            # IOU segments = 4 interfaces each
    },

    "IOU L2": {
        "node_type":         "iou",
        "path":              "/opt/gns3/images/i86bi-linux-l2-adventerprisek9-15.2d.bin",
        "ram":               256,
        "nvram":             128,
        "ethernet_adapters": 1,
        "serial_adapters":   0,
        "console_type":      "telnet",
        "port_name_format":  "Ethernet{0}/{1}",
        "port_segment_size": 4,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  BUILT-IN: VPCS
    #  Source: gns3server/schemas/vpcs_template.py
    # ═══════════════════════════════════════════════════════════════════════════

    "VPCS": {
        "node_type":         "vpcs",
        "console_type":      "telnet",
        "port_name_format":  "Ethernet{0}",
        "port_segment_size": 1,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  BUILT-IN: Ethernet Switch
    #  Source: gns3server/schemas/ethernet_switch_template.py
    #         gns3server/compute/builtin/nodes/ethernet_switch.py
    #  GNS3 creates 8 access ports (VLAN 1) by default.
    #  port type enum: "access", "dot1q", "qinq"
    #  ethertype enum: "", "0x8100", "0x88A8", "0x9100", "0x9200"
    # ═══════════════════════════════════════════════════════════════════════════

    "Ethernet Switch": {
        "node_type":         "ethernet_switch",
        "console_type":      "none",       # GNS3 default — no console on switches
        "ports_mapping":     _DEFAULT_SWITCH_PORTS,
        "port_name_format":  "Ethernet{0}",
        "port_segment_size": 1,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  BUILT-IN: Ethernet Hub
    #  Source: gns3server/schemas/ethernet_hub_template.py
    #         gns3server/compute/builtin/nodes/ethernet_hub.py
    #  No console_type — hubs have no console at all.
    # ═══════════════════════════════════════════════════════════════════════════

    "Ethernet Hub": {
        "node_type":         "ethernet_hub",
        "ports_mapping":     _DEFAULT_HUB_PORTS,
        "port_name_format":  "Ethernet{0}",
        "port_segment_size": 1,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  BUILT-IN: Cloud
    #  Source: gns3server/schemas/cloud_template.py
    #         gns3server/compute/builtin/nodes/cloud.py
    #  ports_mapping is empty — GNS3 auto-populates from host interfaces
    #  at node creation time.  No console_type.
    # ═══════════════════════════════════════════════════════════════════════════

    "Cloud": {
        "node_type":         "cloud",
        "ports_mapping":     [],            # Populated at runtime from host NICs
        "port_name_format":  "Ethernet{0}",
        "port_segment_size": 1,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  BUILT-IN: NAT
    #  Source: gns3server/schemas/nat.py
    #         gns3server/compute/builtin/nodes/nat.py
    #  NAT extends Cloud.  Auto-creates one port (nat0) linked to host's
    #  NAT interface: virbr0 (Linux) or vmnet8 (macOS/Windows).
    #  ports_mapping is read-only on NAT — the setter is a no-op.
    #  No console_type.
    # ═══════════════════════════════════════════════════════════════════════════

    "NAT": {
        "node_type":         "nat",
        "ports_mapping":     [],            # Auto-populated: nat0 → virbr0/vmnet8
        "port_name_format":  "nat{0}",
        "port_segment_size": 1,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  BUILT-IN: Frame Relay Switch
    #  Source: gns3server/schemas/frame_relay_switch.py
    #  mappings format: {"port:dlci": "port:dlci", ...}
    #  e.g. {"1:101": "2:202", "1:102": "2:202"}
    #  No console_type.
    # ═══════════════════════════════════════════════════════════════════════════

    "Frame Relay Switch": {
        "node_type":         "frame_relay_switch",
        "mappings":          {},
        "port_name_format":  "Serial{0}",
        "port_segment_size": 1,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  BUILT-IN: ATM Switch
    #  Source: gns3server/schemas/atm_switch.py
    #  mappings format: {"port:vpi:vci": "port:vpi:vci", ...}
    #  No console_type.
    # ═══════════════════════════════════════════════════════════════════════════

    "ATM Switch": {
        "node_type":         "atm_switch",
        "mappings":          {},
        "port_name_format":  "ATM{0}",
        "port_segment_size": 1,
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  QEMU  (source: gns3server/schemas/qemu_template.py)
    #  Schema defaults: ram=256, adapters=1, adapter_type="e1000",
    #                   console_type="telnet", linked_clone=true
    # ═══════════════════════════════════════════════════════════════════════════

    "Cisco CSR1000v": {
        # Source: gns3-registry/appliances/cisco-csr1000v.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "csr1000v-universalk9-serial.qcow2",
        "hda_disk_interface":    "ide",
        "ram":                   4096,
        "cpus":                  1,
        "adapters":              4,
        "adapter_type":          "vmxnet3",
        "console_type":          "telnet",
        "port_name_format":      "GigabitEthernet{port1}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "boot_priority":         "c",
        "kvm":                   "require",
    },

    "pfSense": {
        # Source: gns3-registry/appliances/pfsense.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "pfSense-CE-2.7.2-RELEASE-amd64.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   2048,
        "cpus":                  1,
        "adapters":              6,
        "adapter_type":          "e1000",
        "console_type":          "vnc",
        "port_name_format":      "em{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "boot_priority":         "c",
        "kvm":                   "allow",
    },

    "Alpine Linux": {
        # Source: gns3-registry/appliances/alpine-linux-virt.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "alpine-virt-3.19.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   128,
        "cpus":                  1,
        "adapters":              1,
        "adapter_type":          "virtio-net-pci",
        "console_type":          "telnet",
        "port_name_format":      "eth{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "allow",
    },

    "OpenWrt": {
        # Source: gns3-registry/appliances/openwrt.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "openwrt-x86-64-generic-ext4-combined.img",
        "hda_disk_interface":    "ide",
        "ram":                   128,
        "cpus":                  1,
        "adapters":              4,
        "adapter_type":          "virtio-net-pci",
        "console_type":          "telnet",
        "port_name_format":      "eth{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "allow",
    },

    "FRRouting": {
        # Source: gns3-registry/appliances/frr.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "frr-8.2.2.qcow2",
        "hda_disk_interface":    "ide",
        "ram":                   256,
        "cpus":                  1,
        "adapters":              8,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "eth{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "allow",
        "usage":                 "Credentials: root / root\nvtysh to access the router CLI",
    },

    "OVS": {
        # Open vSwitch — common QEMU-based appliance
        "node_type":             "qemu",
        "hda_disk_image":        "openvswitch.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   256,
        "cpus":                  1,
        "adapters":              8,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "eth{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "allow",
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  QEMU — CISCO  (must-have / popular additions)
    # ═══════════════════════════════════════════════════════════════════════════

    "Cisco IOSv": {
        # Source: gns3-registry/appliances/cisco-iosv.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "vios-adventerprisek9-mz.SPA.158-3.M3.qcow2",
        "hda_disk_interface":    "ide",
        "ram":                   512,
        "cpus":                  1,
        "adapters":              4,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "GigabitEthernet0/{0}",
        "port_segment_size":     0,
        "first_port_name":       "GigabitEthernet0/0",
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/router.svg",
    },

    "Cisco IOSv-L2": {
        # Source: gns3-registry/appliances/cisco-iosvl2.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "vios_l2-adventerprisek9-mz.SPA.158-3.M3.qcow2",
        "hda_disk_interface":    "ide",
        "ram":                   1024,
        "cpus":                  1,
        "adapters":              8,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "GigabitEthernet0/{0}",
        "port_segment_size":     0,
        "first_port_name":       "GigabitEthernet0/0",
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/switch.svg",
    },

    "Cisco ASAv": {
        # Source: gns3-registry/appliances/cisco-asav.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "asav-9162-ssh.qcow2",
        "hda_disk_interface":    "ide",
        "ram":                   2048,
        "cpus":                  1,
        "adapters":              4,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "GigabitEthernet0/{0}",
        "port_segment_size":     0,
        "first_port_name":       "GigabitEthernet0/0",
        "linked_clone":          True,
        "kvm":                   "allow",
        "options":               "-machine accel=kvm -cpu host -smp 2",
        "_symbol":               ":/symbols/firewall.svg",
    },

    "Cisco Nexus 9000v": {
        # Source: gns3-registry/appliances/cisco-n9kv.gns3a
        # Multi-disk: hda = boot, hdb = N9K system image
        "node_type":             "qemu",
        "hda_disk_image":        "n9kv-disk-a.qcow2",
        "hda_disk_interface":    "ide",
        "hdb_disk_image":        "n9kv-disk-b.qcow2",
        "hdb_disk_interface":    "ide",
        "ram":                   8192,
        "cpus":                  2,
        "adapters":              8,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "Ethernet1/{0}",
        "port_segment_size":     0,
        "first_port_name":       "Ethernet1/1",
        "linked_clone":          True,
        "kvm":                   "require",
        "boot_priority":         "c",
        "_symbol":               ":/symbols/switch.svg",
    },

    "Cisco Catalyst 8000v": {
        # Source: gns3-registry/appliances/cisco-cat8000v.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "cat8000v-universalk9.17.06.01a.qcow2",
        "hda_disk_interface":    "ide",
        "ram":                   4096,
        "cpus":                  2,
        "adapters":              4,
        "adapter_type":          "vmxnet3",
        "console_type":          "telnet",
        "port_name_format":      "GigabitEthernet1/{0}",
        "port_segment_size":     0,
        "first_port_name":       "GigabitEthernet1/0",
        "linked_clone":          True,
        "kvm":                   "require",
        "boot_priority":         "c",
        "_symbol":               ":/symbols/router.svg",
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  QEMU — JUNIPER  (popular additions)
    # ═══════════════════════════════════════════════════════════════════════════

    "Juniper vMX": {
        # Source: gns3-registry/appliances/juniper-vmx.gns3a
        # Multi-disk: hda = boot (VFP), hdb = RBD (VCP)
        "node_type":             "qemu",
        "hda_disk_image":        "jinstall-vfpx-17.3R1.10.img",
        "hda_disk_interface":    "ide",
        "hdb_disk_image":        "jinstall-vcp-17.3R1.10.img",
        "hdb_disk_interface":    "ide",
        "ram":                   4096,
        "cpus":                  2,
        "adapters":              4,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "ge-0/0/{0}",
        "port_segment_size":     0,
        "first_port_name":       "ge-0/0/0",
        "linked_clone":          True,
        "kvm":                   "require",
        "boot_priority":         "c",
        "_symbol":               ":/symbols/router.svg",
    },

    "Juniper vSRX": {
        # Source: gns3-registry/appliances/juniper-vsrx.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "junos-vsrx-12.1X47-D15.4-domestic.qcow2",
        "hda_disk_interface":    "ide",
        "ram":                   4096,
        "cpus":                  2,
        "adapters":              4,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "ge-0/0/{0}",
        "port_segment_size":     0,
        "first_port_name":       "ge-0/0/0",
        "linked_clone":          True,
        "kvm":                   "require",
        "boot_priority":         "c",
        "_symbol":               ":/symbols/firewall.svg",
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  QEMU — ARISTA / DATA CENTER  (popular additions)
    # ═══════════════════════════════════════════════════════════════════════════

    "Arista vEOS": {
        # Source: gns3-registry/appliances/arista-veos.gns3a
        # Multi-disk: hda = Aboot ISO, hdb = vEOS-lab disk
        "node_type":             "qemu",
        "hda_disk_image":        "Aboot-veos-serial-8.0.1.iso",
        "hda_disk_interface":    "ide",
        "hdb_disk_image":        "vEOS-lab-4.27.0F.vmdk",
        "hdb_disk_interface":    "ide",
        "ram":                   2048,
        "cpus":                  1,
        "adapters":              8,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "Ethernet1/{0}",
        "port_segment_size":     0,
        "first_port_name":       "Ethernet1/1",
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/switch.svg",
    },

    "Cumulus VX": {
        # Source: gns3-registry/appliances/cumulus-vx.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "cumulus-vx-4.4.0-qemu5.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   1024,
        "cpus":                  1,
        "adapters":              4,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "swp{0}",
        "port_segment_size":     0,
        "first_port_name":       "swp1",
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/switch.svg",
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  QEMU — FIREWALL / SECURITY  (popular additions)
    # ═══════════════════════════════════════════════════════════════════════════

    "FortiGate": {
        # Source: gns3-registry/appliances/fortigate.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "FGT_VM64_KVM-v7.2.3.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   1024,
        "cpus":                  1,
        "adapters":              4,
        "adapter_type":          "virtio-net-pci",
        "console_type":          "telnet",
        "port_name_format":      "port{0}",
        "port_segment_size":     0,
        "first_port_name":       "port1",
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/firewall.svg",
    },

    "Palo Alto VM-100": {
        # Source: gns3-registry/appliances/paloalto-vm.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "PA-VM-10.2.3.qcow2",
        "hda_disk_interface":    "ide",
        "ram":                   4096,
        "cpus":                  2,
        "adapters":              4,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "ethernet1/{0}",
        "port_segment_size":     0,
        "first_port_name":       "ethernet1/1",
        "linked_clone":          True,
        "kvm":                   "require",
        "_symbol":               ":/symbols/firewall.svg",
    },

    "Check Point Gaia": {
        # Source: gns3-registry/appliances/checkpoint.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "cp_sg_R81.20_qfw1kvm.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   4096,
        "cpus":                  2,
        "adapters":              4,
        "adapter_type":          "e1000",
        "console_type":          "vnc",
        "port_name_format":      "eth{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "require",
        "_symbol":               ":/symbols/firewall.svg",
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  QEMU — ROUTER / OS  (also common additions)
    # ═══════════════════════════════════════════════════════════════════════════

    "VyOS": {
        # Source: gns3-registry/appliances/vyos.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "vyos-1.4-rolling-202312120017-amd64.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   1024,
        "cpus":                  1,
        "adapters":              4,
        "adapter_type":          "virtio-net-pci",
        "console_type":          "telnet",
        "port_name_format":      "eth{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/router.svg",
    },

    "Dell OS10": {
        # Source: gns3-registry/appliances/dell-os10.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "OS10-Enterprise-10.5.4.1.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   4096,
        "cpus":                  2,
        "adapters":              8,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "ethernet1/1/{0}",
        "port_segment_size":     0,
        "first_port_name":       "ethernet1/1/1",
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/switch.svg",
    },

    "Ubuntu": {
        # Source: gns3-registry/appliances/ubuntu.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "ubuntu-22.04-desktop-amd64.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   2048,
        "cpus":                  2,
        "adapters":              1,
        "adapter_type":          "virtio-net-pci",
        "console_type":          "vnc",
        "port_name_format":      "ens{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/computer.svg",
    },

    "Kali Linux": {
        # Source: gns3-registry/appliances/kali.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "kali-linux-2023.4-qemu-amd64.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   2048,
        "cpus":                  2,
        "adapters":              1,
        "adapter_type":          "virtio-net-pci",
        "console_type":          "vnc",
        "port_name_format":      "eth{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/computer.svg",
    },

    "Windows": {
        # Source: gns3-registry/appliances/windows.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "windows-10-x64.qcow2",
        "hda_disk_interface":    "sata",
        "ram":                   4096,
        "cpus":                  2,
        "adapters":              1,
        "adapter_type":          "e1000",
        "console_type":          "vnc",
        "port_name_format":      "Ethernet{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/computer.svg",
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  QEMU — TRAFFIC GENERATORS  (also common additions)
    # ═══════════════════════════════════════════════════════════════════════════

    "Ostinato": {
        # Source: gns3-registry/appliances/ostinato.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "ostinato-drone-1.2.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   1024,
        "cpus":                  1,
        "adapters":              4,
        "adapter_type":          "e1000",
        "console_type":          "vnc",
        "port_name_format":      "eth{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/traffic_generator.svg",
    },

    "TRex": {
        # Source: gns3-registry/appliances/trex.gns3a
        "node_type":             "qemu",
        "hda_disk_image":        "trex-v3.02.qcow2",
        "hda_disk_interface":    "virtio",
        "ram":                   2048,
        "cpus":                  2,
        "adapters":              4,
        "adapter_type":          "e1000",
        "console_type":          "telnet",
        "port_name_format":      "eth{0}",
        "port_segment_size":     0,
        "linked_clone":          True,
        "kvm":                   "allow",
        "_symbol":               ":/symbols/traffic_generator.svg",
    },

    # ═══════════════════════════════════════════════════════════════════════════
    #  DOCKER  (source: gns3server/schemas/docker_template.py)
    #  Schema defaults: adapters=1, console_type="telnet"
    #  image is REQUIRED — no default.
    # ═══════════════════════════════════════════════════════════════════════════

    "Alpine Docker": {
        "node_type":         "docker",
        "image":             "alpine:latest",
        "adapters":          1,
        "console_type":      "telnet",
        "port_name_format":  "eth{0}",
        "port_segment_size": 0,
        "start_command":     "",
        "environment":       "",
    },

    "FRR Docker": {
        "node_type":         "docker",
        "image":             "frrouting/frr:latest",
        "adapters":          4,
        "console_type":      "telnet",
        "port_name_format":  "eth{0}",
        "port_segment_size": 0,
        "start_command":     "/sbin/init",
        "environment":       "",
    },

    "OVS Docker": {
        "node_type":         "docker",
        "image":             "openvswitch/ovs:latest",
        "adapters":          8,
        "console_type":      "telnet",
        "port_name_format":  "eth{0}",
        "port_segment_size": 0,
        "start_command":     "",
        "environment":       "",
    },
}
