import json
import tempfile
import unittest
import zipfile
from pathlib import Path

from structranet.export.gns3_exporter import ExportError, convert
from structranet.export.validator import GNS3ProjectValidator


class GoldenExportTests(unittest.TestCase):
    def test_golden_minimal_topology_exports_and_validates(self):
        fixture = Path("tests/fixtures/golden_minimal_topology.json")
        data = json.loads(fixture.read_text(encoding="utf-8"))

        with tempfile.TemporaryDirectory() as td:
            out_file = Path(td) / "golden_minimal.gns3project"
            result_path = convert(data, str(out_file))
            self.assertTrue(Path(result_path).exists(), "Expected .gns3project output file")

            validator = GNS3ProjectValidator(str(out_file), verbose=False)
            ok = validator.validate()
            self.assertTrue(ok, "Expected validator to pass for golden fixture")

    def test_dynamips_config_uses_pointer_and_strips_ai_metadata(self):
        data = {
            "project_name": "regression",
            "topology": {
                "nodes": [{
                    "node_id": "r1",
                    "name": "R1",
                    "node_type": "dynamips",
                    "template_name": "c3745",
                    "properties": {
                        "platform": "c3745",
                        "nvram": 256,
                        "startup_config_content": "hostname R1\n",
                        "_interfaces": ["FastEthernet0/0"],
                        "_hardware_summary": "test-only",
                        "_image_required": True,
                        "_link_count": 0,
                    },
                }],
                "links": [],
            },
        }

        with tempfile.TemporaryDirectory() as td:
            out_file = Path(td) / "regression.gns3project"
            convert(
                data,
                str(out_file),
                image_map={"c3745": "c3745-adventerprisek9-mz.124-25d.bin"},
            )

            with zipfile.ZipFile(out_file) as archive:
                project_name = next(
                    name for name in archive.namelist() if name.endswith(".gns3")
                )
                project = json.loads(archive.read(project_name))
                node = project["topology"]["nodes"][0]
                props = node["properties"]

                self.assertEqual(node["compute_id"], "local")
                self.assertNotIn("template_id", node)
                self.assertEqual(props["nvram"], 256)
                self.assertEqual(
                    props["startup_config"], "configs/startup-config.cfg"
                )
                self.assertNotIn("startup_config_content", props)
                for key in (
                    "_interfaces", "_hardware_summary", "_image_required", "_link_count"
                ):
                    self.assertNotIn(key, props)

                config_path = (
                    f"project-files/dynamips/{node['node_id']}/"
                    "configs/startup-config.cfg"
                )
                self.assertEqual(archive.read(config_path).decode(), "hostname R1\n")

    def test_file_backed_vpcs_config_and_nested_metadata_are_not_serialized(self):
        data = {
            "name": "portable",
            "topology": {
                "nodes": [{
                    "node_id": "pc1",
                    "name": "PC1",
                    "node_type": "vpcs",
                    "compute_id": "gns3vm",
                    "properties": {
                        "startup_script": "ip 10.0.0.2/24\n",
                        "custom": {"visible": True, "_secret": "remove"},
                        "_internal": "remove",
                    },
                }],
                "links": [],
            },
        }

        with tempfile.TemporaryDirectory() as td:
            out_file = Path(td) / "portable.gns3project"
            convert(data, str(out_file))
            with zipfile.ZipFile(out_file) as archive:
                project_name = next(name for name in archive.namelist() if name.endswith(".gns3"))
                node = json.loads(archive.read(project_name))["topology"]["nodes"][0]
                self.assertEqual(node["compute_id"], "local")
                self.assertNotIn("template_id", node)
                self.assertNotIn("startup_script", node["properties"])
                self.assertNotIn("_internal", node["properties"])
                self.assertNotIn("custom", node["properties"])
                script_path = f"project-files/vpcs/{node['node_id']}/startup.vpc"
                self.assertEqual(archive.read(script_path).decode(), "ip 10.0.0.2/24\n")

    def test_vm_dependent_node_is_rejected(self):
        data = {
            "name": "vm-dependent",
            "topology": {
                "nodes": [{
                    "node_id": "q1",
                    "name": "QEMU1",
                    "node_type": "qemu",
                    "template_name": "Cisco CSR1000v",
                    "properties": {"hda_disk_image": "csr.qcow2"},
                }],
                "links": [],
            },
        }
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaisesRegex(ExportError, "Windows Local GNS3 Server"):
                convert(data, str(Path(td) / "invalid.gns3project"), image_map={
                    "Cisco CSR1000v": "csr.qcow2",
                })

    def test_dynamips_without_calibrated_image_is_rejected(self):
        data = {
            "name": "missing-image",
            "topology": {
                "nodes": [{
                    "node_id": "r1",
                    "name": "R1",
                    "node_type": "dynamips",
                    "template_name": "c3745",
                    "properties": {"platform": "c3745"},
                }],
                "links": [],
            },
        }
        with tempfile.TemporaryDirectory() as td:
            with self.assertRaisesRegex(ExportError, "calibrated local image"):
                convert(data, str(Path(td) / "invalid.gns3project"))


if __name__ == "__main__":
    unittest.main()

