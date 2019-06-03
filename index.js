const request = require('request-promise');
const cheerio = require('cheerio');
const xl = require('excel4node');

// News only for now
const deskWordpressCategory = 31;
const deskName = 'News';
const now = new Date();
const startOfLastMonth = new Date(now.getFullYear(), now.getMonth() - 1, 1);

const getPosts = () => {
  return request({
    url: `https://pittnews.com/wp-json/wp/v2/posts?categories=${deskWordpressCategory}&per_page=100`,
    json: true
  })
  .then((posts) => {
    const validPosts = posts.filter((post) => {
      return new Date(post.date) > startOfLastMonth;
    });

    return Promise.resolve(validPosts);
  });
};

const mapPostsToWriters = (posts) => {
  const writers = {};

  posts.forEach((post) => {
    const $ = cheerio.load(`<div id="content">${post.content.rendered}</div>`);

    post.custom_fields.writer.forEach((writer) => {
      if (!writers[writer]) {
        writers[writer] = [];
      }

      writers[writer].push({
        date: new Date(post.date).toLocaleDateString(),
        headline: post.title.rendered,
        characters: $('div#content').text().length - 1,
        jobTitle: post.custom_fields.jobtitle.join('')
      });
    });
  });

  return Promise.resolve(writers);
};

const writerJobTitles = {
  'Jon Moss': 'News Editor',
  'Neena Hagen': 'Senior Staff Writer'
};

const getPayRate = (writer, jobTitle) => {
  if (['Editor-in-chief', 'News Editor', 'For The Pitt News'].includes(jobTitle)) {
    return 0;
  } else if (['Staff Writer'].includes(jobTitle)) {
    return 0.0025;
  } else if (['Senior Staff Writers', 'Senior Staff Writer', 'Contributing Editor'].includes(jobTitle)) {
    return 0.0035;
  }

  if (jobTitle === 'The Pitt News Staff') {
    if (!writerJobTitles[writer]) {
      throw new Error(`Need to define job title for writer: ${writer}`);
    } else {
      return getPayRate(writer, writerJobTitles[writer]);
    }
  }

  throw new Error(`Unknown job title: ${jobTitle}`);
};

const calculatePays = (writers) => {
  Object.keys(writers).forEach((writer) => {
    writers[writer].forEach((post) => {
      const unroundedPay = post.characters * getPayRate(writer, post.jobTitle);
      post.pay = Math.round(100 * unroundedPay) / 100;
    });
  });

  return Promise.resolve(writers);
};

const savePays = (writers) => {
  const workbook = new xl.Workbook();

  Object.keys(writers).forEach((writer) => {
    const totalPay = writers[writer].reduce((total, post) => {
      return total + post.pay;
    }, 0);

    if (totalPay === 0) {
      return;
    }

    const worksheet = workbook.addWorksheet(writer);
    const style = workbook.createStyle({
      font: {
        color: 'black',
        size: 12,
      },
    });

    worksheet.column(1).setWidth(15);
    worksheet.column(2).setWidth(70);
    worksheet.column(3).setWidth(15);
    worksheet.column(4).setWidth(15);

    worksheet.cell(1, 1).string('Date').style(style);
    worksheet.cell(1, 2).string('Headline').style(style);
    worksheet.cell(1, 3).string('Characters').style(style);
    worksheet.cell(1, 4).string('Pay').style(style);

    var rowCounter = 2;
    writers[writer].forEach((post) => {
      const postRow = rowCounter++;
      worksheet.cell(postRow, 1).string(post.date).style(style);
      worksheet.cell(postRow, 2).string(post.headline).style(style);
      worksheet.cell(postRow, 3).number(post.characters).style(style);
      worksheet.cell(postRow, 4).number(post.pay).style(style);
    });

    worksheet.cell(rowCounter++, 4).number(totalPay).style(style);
  });

  const month = startOfLastMonth.toLocaleString('en-us', { month: 'long' });
  workbook.write(`Pays-${month}-${deskName}.xlsx`);
};

getPosts()
  .then(mapPostsToWriters)
  .then(calculatePays)
  .then(savePays)
  .then(() => { console.log('Done!'); })
  .catch(console.log);
