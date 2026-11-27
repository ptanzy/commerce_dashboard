"""WU-12 customer review enrichment tests; no external dependencies required."""
from collections import Counter
import csv
import io
import sys
import tempfile
import unittest
from pathlib import Path
from zipfile import ZipFile

ROOT=Path(__file__).resolve().parents[1]
sys.path.insert(0,str(ROOT/'scripts'))
from prepare_data import (REVIEWS_FILENAME, aggregate_review_scores, input_paths, validate_headers)

class CustomerReviewExportTests(unittest.TestCase):
    def test_multiple_review_scores_per_order_are_deduplicated_without_raw_text(self):
        invalid=Counter()
        rows=[('a','r1','5'),('a','r2','1'),('a','r1','5'),('b','r3','3'),('ghost','r4','5'),('a','r5','unknown'),('a','','4')]
        result=aggregate_review_scores(rows,{'a','b'},invalid)
        self.assertEqual(result,{'a':[1,0,0,0,1],'b':[0,0,1,0,0]})
        self.assertEqual(invalid['duplicateReviewRows'],1)
        self.assertEqual(invalid['orphanReviewRows'],1)
        self.assertEqual(invalid['invalidReviewRows'],2)
    def test_absent_file_is_different_from_available_but_empty_review_file(self):
        self.assertEqual(aggregate_review_scores(None,{'a'},Counter()),{})
        self.assertEqual(aggregate_review_scores([],{'a'},Counter()),{})
    def test_optional_directory_source_never_requires_review_csv(self):
        from prepare_data import INPUTS
        with tempfile.TemporaryDirectory() as tmp:
            root=Path(tmp)
            for name,(filename,headers) in INPUTS.items():
                (root/filename).write_text(','.join(sorted(headers))+'\n',encoding='utf-8')
            with input_paths(root) as (paths,_):
                self.assertNotIn('reviews',paths)
                validate_headers(paths)
            (root/REVIEWS_FILENAME).write_text('review_id,order_id,review_score,review_comment_message\nr1,a,5,PRIVATE\n',encoding='utf-8')
            with input_paths(root) as (paths,_):
                self.assertIn('reviews',paths)
                validate_headers(paths)
    def test_ambiguous_archive_review_files_fail_closed(self):
        from prepare_data import INPUTS
        with tempfile.TemporaryDirectory() as tmp:
            archive=Path(tmp)/'source.zip'
            with ZipFile(archive,'w') as z:
                for name,(filename,headers) in INPUTS.items():
                    z.writestr(filename,','.join(sorted(headers))+'\n')
                z.writestr(REVIEWS_FILENAME,'review_id,order_id,review_score\n')
                z.writestr('nested/'+REVIEWS_FILENAME,'review_id,order_id,review_score\n')
            with self.assertRaisesRegex(ValueError,'Ambiguous reviews'):
                with input_paths(archive):pass

if __name__=='__main__':unittest.main()
