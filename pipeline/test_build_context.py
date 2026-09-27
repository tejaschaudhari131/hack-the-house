import unittest

from build_context import height_for


class BuildingHeights(unittest.TestCase):
    def test_only_unambiguous_usable_stories_become_estimates(self):
        self.assertEqual(height_for('2.5', True), (9, 'stories_estimate', 2.5))
        for value in [None, '', 'unknown', 'nan', 'inf', '-2', '0', '100']:
            self.assertEqual(height_for(value, True), (9, 'placeholder', None))
        self.assertEqual(height_for('3', False), (9, 'placeholder', None))


if __name__ == '__main__':
    unittest.main()
