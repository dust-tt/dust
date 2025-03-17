{
  'conditions': [
    [ 'OS!="win"', {
      'targets': [ {
          'target_name': 'unix_dgram',
          'sources': [ 'src/unix_dgram.cc' ],
          'include_dirs': [
            '<!(node -e "require(\'nan\')")'
          ]
        } ]
      }
    ],
    [ 'OS=="win"', {
      'targets': [ {
        'target_name': 'unix_dgram',
        'sources': [ 'src/win_dummy.cc' ],
      } ]
    } ]
  ]
}
