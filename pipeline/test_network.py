import unittest
from build_network import walkable, blocked_node


class NetworkRules(unittest.TestCase):
    def test_pedestrian_permissions(self):
        self.assertTrue(walkable({'highway': 'residential'}))
        self.assertTrue(walkable({'highway': 'steps'}))
        for tags in [{'highway': 'motorway'}, {'highway': 'path', 'foot': 'private'}, {'highway': 'service', 'access': 'private'}, {'highway': 'cycleway'}, {'highway': 'footway', 'foot:conditional': 'yes @ (Mo-Fr)'}]:
            self.assertFalse(walkable(tags))
        self.assertTrue(walkable({'highway': 'path', 'access': 'private', 'foot': 'yes'}))

    def test_barriers_are_not_invisible(self):
        self.assertTrue(blocked_node({'barrier': 'fence'}))
        self.assertTrue(blocked_node({'barrier': 'gate', 'access': 'private'}))
        self.assertFalse(blocked_node({'barrier': 'bollard'}))
        self.assertFalse(blocked_node({'barrier': 'gate', 'foot': 'yes'}))


if __name__ == '__main__':
    unittest.main()
